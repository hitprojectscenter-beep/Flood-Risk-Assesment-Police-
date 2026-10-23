-- ============================================================================
-- יומן שטח (field-collect) · סכמת מסד נתונים + הרשאות (RLS) + אחסון תמונות
-- להרצה פעם אחת ב-Supabase: Dashboard → SQL Editor → New query → Run.
-- בטוח להרצה חוזרת (idempotent).
--
-- עקרון ההרשאות (נאכף במסד הנתונים, לא בקוד הלקוח):
--   • צפייה — פתוחה לכולם, גם ללא הרשמה (anon).
--   • הוספת נקודה — רק למשתמש רשום ומחובר, ורק בשמו (user_id = auth.uid()).
--   • עריכה/מחיקה — רק ע"י מי שהזין את הנקודה.
-- ============================================================================

create table if not exists public.field_points (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_name  text not null check (char_length(location_name) between 1 and 120),
  reporter_name  text not null check (char_length(reporter_name) between 1 and 80),
  notes          text not null default '' check (char_length(notes) <= 2000),
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  accuracy_m     integer,
  photo_paths    text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists field_points_created_idx on public.field_points (created_at desc);
create index if not exists field_points_user_idx on public.field_points (user_id);

alter table public.field_points enable row level security;

drop policy if exists fp_read_all    on public.field_points;
drop policy if exists fp_insert_own  on public.field_points;
drop policy if exists fp_update_own  on public.field_points;
drop policy if exists fp_delete_own  on public.field_points;

create policy fp_read_all   on public.field_points for select to anon, authenticated using (true);
create policy fp_insert_own on public.field_points for insert to authenticated with check (user_id = auth.uid());
create policy fp_update_own on public.field_points for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy fp_delete_own on public.field_points for delete to authenticated using (user_id = auth.uid());

-- עדכון אוטומטי של updated_at
create or replace function public.fp_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists fp_touch on public.field_points;
create trigger fp_touch before update on public.field_points for each row execute function public.fp_touch();

-- עדכונים בזמן אמת לכל הצופים (הופעת נקודה חדשה במפה בלי רענון)
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'field_points') then
    alter publication supabase_realtime add table public.field_points;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- אחסון תמונות: bucket ציבורי לקריאה ("field-photos"), כתיבה רק לתיקיית המשתמש
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-photos', 'field-photos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true;

drop policy if exists fph_read_all   on storage.objects;
drop policy if exists fph_insert_own on storage.objects;
drop policy if exists fph_delete_own on storage.objects;

create policy fph_read_all on storage.objects for select to anon, authenticated
  using (bucket_id = 'field-photos');
create policy fph_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'field-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy fph_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'field-photos' and (storage.foldername(name))[1] = auth.uid()::text);
