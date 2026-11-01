-- ============================================================================
-- יומן שטח · מיגרציה 002 — רישום משתמשים, ניהול משתמשים ותיעוד "מי הוסיף"
-- להרצה ב-Supabase SQL Editor אחרי field_points.sql. בטוח להרצה חוזרת.
--
--   • fc_users      — משתמשי היישום: שם, נייד (מאומת SMS), ארגון/תפקיד, סטטוס, תפקיד
--   • fc_settings   — אישור אוטומטי למשתמשים חדשים + מספרי מנהלים
--   • field_points  — created_by_name / updated_by / updated_by_name נרשמים ע"י השרת
--
-- (הטבלה נקראת fc_users ולא profiles — הפרויקט משותף עם field-nav-app שכבר משתמש ב-profiles)
-- ============================================================================

-- ---------------------------------------------------------------- הגדרות --
create table if not exists public.fc_settings (
  id            int primary key default 1 check (id = 1),
  auto_approve  boolean not null default false,          -- false = משתמש חדש ממתין לאישור מנהל
  admin_phones  text[]  not null default '{972505714100}' -- בפורמט auth.users.phone (ללא +)
);
insert into public.fc_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- משתמשים --
create table if not exists public.fc_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text not null default '',
  first_name  text not null check (char_length(first_name) between 1 and 40),
  last_name   text not null check (char_length(last_name) between 1 and 40),
  org         text not null default '' check (char_length(org) <= 120),   -- ארגון / יחידה / תפקיד
  role        text not null default 'editor' check (role in ('editor','admin')),
  status      text not null default 'pending' check (status in ('pending','approved','blocked')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  last_seen   timestamptz not null default now()
);
create index if not exists fc_users_status_idx on public.fc_users(status);

-- פונקציות עזר (security definer — לא נחשפות למניפולציה ע"י RLS)
create or replace function public.fc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fc_users where id = auth.uid() and role = 'admin' and status = 'approved');
$$;
create or replace function public.fc_is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fc_users where id = auth.uid() and status = 'approved');
$$;

-- רישום / עדכון פרטים עצמי. הנייד נלקח מ-auth.users (מאומת), לא מהלקוח.
create or replace function public.fc_register(p_first text, p_last text, p_org text default '')
returns public.fc_users language plpgsql security definer set search_path = public as $$
declare
  v_phone text; v_row fc_users; v_set fc_settings; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select phone into v_phone from auth.users where id = auth.uid();
  select * into v_set from fc_settings where id = 1;
  v_admin := v_phone = any(v_set.admin_phones);
  insert into fc_users as u (id, phone, first_name, last_name, org, role, status, approved_at)
  values (auth.uid(), coalesce(v_phone, ''), trim(p_first), trim(p_last), trim(coalesce(p_org, '')),
          case when v_admin then 'admin' else 'editor' end,
          case when v_admin or v_set.auto_approve then 'approved' else 'pending' end,
          case when v_admin or v_set.auto_approve then now() end)
  on conflict (id) do update
     set first_name = excluded.first_name, last_name = excluded.last_name, org = excluded.org,
         phone = excluded.phone, last_seen = now(),
         role = case when v_admin then 'admin' else u.role end,
         status = case when v_admin then 'approved' else u.status end
  returning * into v_row;
  return v_row;
end $$;
grant execute on function public.fc_register(text, text, text) to authenticated;

-- RLS: משתמש רואה את עצמו; מנהל רואה ומעדכן את כולם (סטטוס/תפקיד)
alter table public.fc_users enable row level security;
drop policy if exists fcu_read_self  on public.fc_users;
drop policy if exists fcu_admin_read on public.fc_users;
drop policy if exists fcu_admin_upd  on public.fc_users;
create policy fcu_read_self  on public.fc_users for select to authenticated using (id = auth.uid());
create policy fcu_admin_read on public.fc_users for select to authenticated using (public.fc_is_admin());
create policy fcu_admin_upd  on public.fc_users for update to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

alter table public.fc_settings enable row level security;
drop policy if exists fcs_admin_read on public.fc_settings;
drop policy if exists fcs_admin_upd  on public.fc_settings;
create policy fcs_admin_read on public.fc_settings for select to authenticated using (public.fc_is_admin());
create policy fcs_admin_upd  on public.fc_settings for update to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- -------------------------------------------- נקודות: מי הוסיף / מי עדכן --
alter table public.field_points add column if not exists created_by_name text not null default '';
alter table public.field_points add column if not exists updated_by      uuid references auth.users(id);
alter table public.field_points add column if not exists updated_by_name text not null default '';

create or replace function public.fp_stamp_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select first_name || ' ' || last_name into v_name from fc_users where id = auth.uid();
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();                       -- לא ניתן לזייף את המוסיף
    new.created_by_name := coalesce(v_name, '');
    new.created_at := now();
  else
    new.user_id := old.user_id;                      -- המוסיף המקורי נשמר תמיד
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_by_name := coalesce(v_name, '');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fp_touch on public.field_points;            -- מוחלף ע"י fp_stamp
drop trigger if exists fp_stamp on public.field_points;
create trigger fp_stamp before insert or update on public.field_points
  for each row execute function public.fp_stamp_user();

-- הרשאות נקודות: הוספה למשתמש מאושר; עריכה/מחיקה — למוסיף המאושר או למנהל
drop policy if exists fp_insert_own on public.field_points;
drop policy if exists fp_update_own on public.field_points;
drop policy if exists fp_delete_own on public.field_points;
create policy fp_insert_own on public.field_points for insert to authenticated
  with check (user_id = auth.uid() and public.fc_is_approved());
create policy fp_update_own on public.field_points for update to authenticated
  using ((user_id = auth.uid() and public.fc_is_approved()) or public.fc_is_admin())
  with check ((user_id = auth.uid() and public.fc_is_approved()) or public.fc_is_admin());
create policy fp_delete_own on public.field_points for delete to authenticated
  using ((user_id = auth.uid() and public.fc_is_approved()) or public.fc_is_admin());

-- תמונות: מנהל רשאי למחוק תמונות של כל נקודה (מחיקת נקודה ע"י מנהל)
drop policy if exists fph_admin_delete on storage.objects;
create policy fph_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'field-photos' and public.fc_is_admin());
