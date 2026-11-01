// שכבת נתונים: Supabase (הרשמה + מסד נתונים + אחסון תמונות), עם נפילה
// אוטומטית ל"מצב הדגמה" מקומי (IndexedDB) כשהשרת אינו זמין / לא הוגדר.
//
// ממשק אחיד לשני המימושים:
//   mode, reason
//   getUser() → user | null      onAuth(cb)
//   sendOtp({phone,first,last}) → {demoCode?}      (phone בפורמט E.164: +9725XXXXXXXX)
//   verifyOtp({phone,code,first,last,org})          signOut()
//   user = {id, phone, first, last, name, org, role:'editor'|'admin', status:'pending'|'approved'|'blocked'}
//   usersEnabled — האם טבלת המשתמשים (002_users.sql) קיימת
//   listUsers() / updateUser(id,{status,role}) / getSettings() / setSettings({auto_approve})   — מנהל בלבד
//   listPoints() → [point]     subscribe(cb)
//   createPoint(fields, blobs, onProgress)
//   updatePoint(point, fields, newBlobs, removedPaths, onProgress)
//   deletePoint(point)
// point = {id,user_id,location_name,reporter_name,notes,lat,lng,accuracy_m,
//          photo_paths:[], photos:[url], created_at, updated_at}
import { SUPABASE_URL, SUPABASE_KEY, TABLE, PHOTO_BUCKET, ADMIN_PHONES } from './config.js';
// listOptions() → [{field, value}]   רשימת ערכים מנוהלת להשלמה אוטומטית (טבלת field_options)

const SB_SDK = 'https://esm.sh/@supabase/supabase-js@2.45.4';

function withTimeout(p, ms, msg) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

function photoPath(uid, pointId, i) {
    return `${uid}/${pointId}/${Date.now()}_${i}.jpg`;
}

function hebAuthError(err) {
    const m = (err && err.message) || String(err);
    if (/expired|invalid.*(otp|token)|token.*(invalid|expired)/i.test(m)) return 'הקוד שגוי או שפג תוקפו — בקשו קוד חדש';
    if (/phone.*(provider|disabled|not enabled)|unsupported phone|sms.*(provider|disabled)/i.test(m))
        return 'שליחת SMS אינה מופעלת בשרת — יש להפעיל ספק SMS ב-Supabase (Authentication → Providers → Phone)';
    if (/invalid.*phone|phone.*invalid/i.test(m)) return 'מספר הטלפון אינו תקין';
    if (/rate limit|too many|security purposes/i.test(m)) return 'יותר מדי ניסיונות — נסו שוב בעוד מספר דקות';
    return m;
}
function hebDataError(m) {
    if (/row-level security|violates row-level|permission denied/i.test(m)) return 'אין הרשאה לפעולה — ייתכן שהמשתמש ממתין לאישור מנהל';
    return m;
}
const fullName = (f, l) => [f, l].filter(Boolean).join(' ');

// ============================================================================
// Supabase
// ============================================================================
async function supabaseStore() {
    const { createClient } = await withTimeout(import(SB_SDK), 12000, 'טעינת Supabase SDK נכשלה');
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    // בדיקת קיום הטבלה — אם אין, נופלים למצב הדגמה
    const probe = await withTimeout(sb.from(TABLE).select('id').limit(1), 10000, 'השרת אינו מגיב');
    if (probe.error) throw new Error('הטבלה ' + TABLE + ' אינה זמינה: ' + probe.error.message);

    // טבלת המשתמשים (002_users.sql) — אם טרם נוצרה, המערכת עובדת כמו קודם (כל מזוהה מאושר)
    const usersProbe = await sb.from('fc_users').select('id').limit(1);
    const usersEnabled = !usersProbe.error;

    let user = null;
    const authCbs = [];
    async function loadUser(u, names) {
        if (!u) return null;
        const md = u.user_metadata || {};
        const phone = u.phone ? '+' + String(u.phone).replace(/^\+/, '') : '';
        const base = { id: u.id, phone, first: md.first_name || '', last: md.last_name || '', org: md.org || '' };
        if (!usersEnabled) {
            return { ...base, name: fullName(base.first, base.last) || phone || 'משתמש',
                role: ADMIN_PHONES.includes(phone) ? 'admin' : 'editor', status: 'approved' };
        }
        let row = null;
        if (names) {
            const r = await sb.rpc('fc_register', { p_first: names.first, p_last: names.last, p_org: names.org || '' });
            if (r.error) throw new Error('הרישום נכשל: ' + r.error.message);
            row = r.data;
        } else {
            const r = await sb.from('fc_users').select('*').eq('id', u.id).maybeSingle();
            row = r.data;
            if (!row && base.first && base.last) {          // משתמש ותיק — רישום אוטומטי לפי הפרטים שמסר
                const rr = await sb.rpc('fc_register', { p_first: base.first, p_last: base.last, p_org: base.org });
                row = rr.data;
            }
        }
        if (!row) return { ...base, name: fullName(base.first, base.last) || phone, role: 'editor', status: 'unregistered' };
        return { ...base, first: row.first_name, last: row.last_name, org: row.org, name: fullName(row.first_name, row.last_name),
            role: row.role, status: row.status };
    }
    const { data: { session } } = await sb.auth.getSession();
    try { user = await loadUser(session && session.user); } catch (_) { user = null; }
    sb.auth.onAuthStateChange((_e, s) => {
        // setTimeout — מונע deadlock של supabase-js כשקוראים ל-API מתוך ה-callback
        setTimeout(async () => {
            if (!s || !s.user) user = null;
            else if (!user || user.id !== s.user.id) { try { user = await loadUser(s.user); } catch (_) { } }
            authCbs.forEach(cb => cb(user));
        }, 0);
    });
    const mapUser = r => ({ id: r.id, phone: r.phone ? '+' + String(r.phone).replace(/^\+/, '') : '', first: r.first_name, last: r.last_name,
        name: fullName(r.first_name, r.last_name), org: r.org, role: r.role, status: r.status,
        created_at: r.created_at, approved_at: r.approved_at, last_seen: r.last_seen });

    const publicUrl = p => sb.storage.from(PHOTO_BUCKET).getPublicUrl(p).data.publicUrl;
    const hydrate = r => ({ ...r, photo_paths: r.photo_paths || [], photos: (r.photo_paths || []).map(publicUrl) });

    async function uploadAll(uid, pointId, blobs, onProgress) {
        const paths = [];
        for (let i = 0; i < blobs.length; i++) {
            onProgress && onProgress(i + 1, blobs.length);
            const path = photoPath(uid, pointId, i);
            const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blobs[i], {
                contentType: 'image/jpeg', cacheControl: '31536000', upsert: false
            });
            if (error) {
                if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths);
                throw new Error('העלאת תמונה נכשלה: ' + error.message);
            }
            paths.push(path);
        }
        return paths;
    }

    function requireUser() {
        if (!user) throw new Error('יש להתחבר כדי לבצע פעולה זו');
        if (user.status !== 'approved') throw new Error('המשתמש ממתין לאישור מנהל — עדיין לא ניתן להזין נתונים');
        return user;
    }

    return {
        mode: 'cloud',
        reason: '',
        usersEnabled,
        getUser: () => user,
        onAuth: cb => authCbs.push(cb),

        async sendOtp({ phone, first, last }) {
            const { error } = await sb.auth.signInWithOtp({
                phone, options: { data: { first_name: first, last_name: last, display_name: first + ' ' + last } }
            });
            if (error) throw new Error(hebAuthError(error));
            return {};
        },
        async verifyOtp({ phone, code, first, last, org }) {
            const { data, error } = await sb.auth.verifyOtp({ phone, token: code, type: 'sms' });
            if (error) throw new Error(hebAuthError(error));
            // עדכון השם גם למשתמש קיים (metadata של הרשמה נשמר רק בפעם הראשונה)
            const upd = await sb.auth.updateUser({ data: { first_name: first, last_name: last, org: org || '', display_name: first + ' ' + last } });
            user = await loadUser((upd.data && upd.data.user) || data.user, { first, last, org });
        },
        async refreshUser() {
            const { data: { session } } = await sb.auth.getSession();
            user = await loadUser(session && session.user);
            authCbs.forEach(cb => cb(user));
            return user;
        },

        // ---- ניהול משתמשים (RLS: מנהל בלבד) ----
        async listUsers() {
            const { data, error } = await sb.from('fc_users').select('*').order('created_at', { ascending: false });
            if (error) throw new Error(hebDataError(error.message));
            return data.map(mapUser);
        },
        async updateUser(id, patch) {
            const row = {};
            if (patch.status) { row.status = patch.status; if (patch.status === 'approved') { row.approved_at = new Date().toISOString(); row.approved_by = user && user.id; } }
            if (patch.role) row.role = patch.role;
            const { data, error } = await sb.from('fc_users').update(row).eq('id', id).select().single();
            if (error) throw new Error(hebDataError(error.message));
            return mapUser(data);
        },
        async getSettings() {
            const { data, error } = await sb.from('fc_settings').select('auto_approve').eq('id', 1).single();
            if (error) throw new Error(hebDataError(error.message));
            return data;
        },
        async setSettings(patch) {
            const { error } = await sb.from('fc_settings').update(patch).eq('id', 1);
            if (error) throw new Error(hebDataError(error.message));
        },
        async signOut() { await sb.auth.signOut(); },

        async listPoints() {
            const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false }).limit(5000);
            if (error) throw new Error(error.message);
            return data.map(hydrate);
        },

        async listOptions() {
            const { data, error } = await sb.from('field_options').select('field,value').limit(5000);
            return error ? [] : data;          // הטבלה אופציונלית
        },

        subscribe(cb) {
            sb.channel('field_points_feed')
                .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => cb())
                .subscribe();
        },

        async createPoint(fields, blobs, onProgress) {
            const u = requireUser();
            const id = crypto.randomUUID();
            const paths = await uploadAll(u.id, id, blobs, onProgress);
            const { data, error } = await sb.from(TABLE)
                .insert({ id, user_id: u.id, ...fields, photo_paths: paths }).select().single();
            if (error) {
                if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths);
                throw new Error('שמירת הנקודה נכשלה: ' + hebDataError(error.message));
            }
            return hydrate(data);
        },

        async updatePoint(point, fields, newBlobs, removedPaths, onProgress) {
            const u = requireUser();
            const added = await uploadAll(u.id, point.id, newBlobs, onProgress);
            const kept = point.photo_paths.filter(p => !removedPaths.includes(p));
            const { data, error } = await sb.from(TABLE)
                .update({ ...fields, photo_paths: kept.concat(added) })      // updated_at / updated_by — נקבעים בשרת
                .eq('id', point.id).select().single();
            if (error) {
                if (added.length) await sb.storage.from(PHOTO_BUCKET).remove(added);
                throw new Error('עדכון הנקודה נכשל: ' + hebDataError(error.message));
            }
            if (removedPaths.length) await sb.storage.from(PHOTO_BUCKET).remove(removedPaths);
            return hydrate(data);
        },

        async deletePoint(point) {
            requireUser();
            const { error } = await sb.from(TABLE).delete().eq('id', point.id);
            if (error) throw new Error('מחיקה נכשלה: ' + hebDataError(error.message));
            if (point.photo_paths.length) await sb.storage.from(PHOTO_BUCKET).remove(point.photo_paths);
        }
    };
}

// ============================================================================
// מצב הדגמה — הכל במכשיר (IndexedDB לנקודות ולתמונות, localStorage למשתמשים)
// ============================================================================
function idb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('field-collect-demo', 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('points', { keyPath: 'id' });
            req.result.createObjectStore('photos');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function tx(db, store, mode, fn) {
    return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
    });
}

async function demoStore(reason) {
    const db = await idb();
    const USERS = 'fc_demo_users_v2', SESSION = 'fc_demo_session_v2', SETTINGS = 'fc_demo_settings';
    let pendingOtp = null;
    const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
    const readUsers = () => readJSON(USERS, {});                 // id → user
    const writeUsers = u => localStorage.setItem(USERS, JSON.stringify(u));
    const settings = () => readJSON(SETTINGS, { auto_approve: false });
    let sessionId = readJSON(SESSION, null);
    const current = () => (sessionId && readUsers()[sessionId]) || null;
    let user = current();
    const authCbs = [];
    const setSession = id => {
        sessionId = id;
        if (id) localStorage.setItem(SESSION, JSON.stringify(id)); else localStorage.removeItem(SESSION);
        user = current();
        authCbs.forEach(cb => cb(user));
    };
    const isAdminU = () => !!(user && user.role === 'admin' && user.status === 'approved');

    const urlCache = new Map();
    async function photoUrl(path) {
        if (urlCache.has(path)) return urlCache.get(path);
        const blob = await tx(db, 'photos', 'readonly', s => s.get(path));
        const url = blob ? URL.createObjectURL(blob) : '';
        urlCache.set(path, url);
        return url;
    }
    async function hydrate(r) {
        return { ...r, photos: await Promise.all(r.photo_paths.map(photoUrl)) };
    }
    async function putPhotos(uid, pointId, blobs, onProgress) {
        const paths = [];
        for (let i = 0; i < blobs.length; i++) {
            onProgress && onProgress(i + 1, blobs.length);
            const path = photoPath(uid, pointId, i);
            await tx(db, 'photos', 'readwrite', s => s.put(blobs[i], path));
            paths.push(path);
        }
        return paths;
    }
    async function removePhotos(paths) {
        for (const p of paths) {
            await tx(db, 'photos', 'readwrite', s => s.delete(p));
            if (urlCache.has(p)) { URL.revokeObjectURL(urlCache.get(p)); urlCache.delete(p); }
        }
    }
    function requireOwner(point) {
        user = current();
        if (!user) throw new Error('יש להתחבר כדי לבצע פעולה זו');
        if (user.status !== 'approved') throw new Error('המשתמש ממתין לאישור מנהל — עדיין לא ניתן להזין נתונים');
        if (point && point.user_id !== user.id && !isAdminU()) throw new Error('ניתן לערוך רק נקודות שהזנת');
    }

    const listeners = [];
    const changed = () => listeners.forEach(cb => cb());

    return {
        mode: 'demo',
        reason: reason || '',
        usersEnabled: true,
        getUser: () => user,
        onAuth: cb => authCbs.push(cb),

        // מצב הדגמה: אין שליחת SMS אמיתית — הקוד מוצג על המסך
        async sendOtp({ phone }) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            pendingOtp = { phone, code, exp: Date.now() + 5 * 60000 };
            return { demoCode: code };
        },
        async verifyOtp({ phone, code, first, last, org }) {
            if (!pendingOtp || pendingOtp.phone !== phone || Date.now() > pendingOtp.exp || pendingOtp.code !== code)
                throw new Error('הקוד שגוי או שפג תוקפו — בקשו קוד חדש');
            pendingOtp = null;
            const users = readUsers();
            let u = Object.values(users).find(x => x.phone === phone);
            const admin = ADMIN_PHONES.includes(phone);
            const now = new Date().toISOString();
            if (!u) {
                const ok = admin || settings().auto_approve;
                u = { id: crypto.randomUUID(), phone, role: admin ? 'admin' : 'editor', status: ok ? 'approved' : 'pending',
                    created_at: now, approved_at: ok ? now : null };
            }
            if (admin) { u.role = 'admin'; u.status = 'approved'; }
            Object.assign(u, { first, last, org: org || '', name: fullName(first, last), last_seen: now });
            users[u.id] = u;
            writeUsers(users);
            setSession(u.id);
        },
        async refreshUser() { user = current(); authCbs.forEach(cb => cb(user)); return user; },
        async listUsers() {
            if (!isAdminU()) throw new Error('אין הרשאה');
            return Object.values(readUsers()).sort((a, b) => b.created_at.localeCompare(a.created_at));
        },
        async updateUser(id, patch) {
            if (!isAdminU()) throw new Error('אין הרשאה');
            const users = readUsers();
            if (!users[id]) throw new Error('משתמש לא נמצא');
            if (patch.status) { users[id].status = patch.status; if (patch.status === 'approved') users[id].approved_at = new Date().toISOString(); }
            if (patch.role) users[id].role = patch.role;
            writeUsers(users);
            user = current();
            return users[id];
        },
        async getSettings() { if (!isAdminU()) throw new Error('אין הרשאה'); return settings(); },
        async setSettings(patch) { if (!isAdminU()) throw new Error('אין הרשאה'); localStorage.setItem(SETTINGS, JSON.stringify({ ...settings(), ...patch })); },
        async signOut() { setSession(null); },

        async listPoints() {
            const rows = await tx(db, 'points', 'readonly', s => s.getAll());
            rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
            return Promise.all(rows.map(hydrate));
        },
        subscribe(cb) { listeners.push(cb); },
        async listOptions() { return []; },     // במצב הדגמה — הצעות מתוך הנקודות שהוזנו

        async createPoint(fields, blobs, onProgress) {
            requireOwner();
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const paths = await putPhotos(user.id, id, blobs, onProgress);
            const row = { id, ...fields, user_id: user.id, created_by_name: user.name, updated_by: user.id, updated_by_name: user.name,
                photo_paths: paths, created_at: now, updated_at: now };
            await tx(db, 'points', 'readwrite', s => s.put(row));
            changed();
            return hydrate(row);
        },
        async updatePoint(point, fields, newBlobs, removedPaths, onProgress) {
            requireOwner(point);
            const added = await putPhotos(user.id, point.id, newBlobs, onProgress);
            const { photos: _hydrated, ...base } = point;
            const row = {
                ...base,
                ...fields,
                user_id: base.user_id, created_by_name: base.created_by_name, created_at: base.created_at,   // המוסיף המקורי נשמר
                updated_by: user.id, updated_by_name: user.name,
                photo_paths: point.photo_paths.filter(p => !removedPaths.includes(p)).concat(added),
                updated_at: new Date().toISOString()
            };
            await tx(db, 'points', 'readwrite', s => s.put(row));
            await removePhotos(removedPaths);
            changed();
            return hydrate(row);
        },
        async deletePoint(point) {
            requireOwner(point);
            await tx(db, 'points', 'readwrite', s => s.delete(point.id));
            await removePhotos(point.photo_paths);
            changed();
        }
    };
}

export async function createStore() {
    const params = new URLSearchParams(location.search);
    if (params.has('demo')) return demoStore('הופעל ידנית (?demo)');
    if (!SUPABASE_URL || !SUPABASE_KEY) return demoStore('Supabase לא הוגדר (js/config.js)');
    try {
        return await supabaseStore();
    } catch (e) {
        console.warn('[field-collect] Supabase unavailable → demo mode:', e);
        return demoStore(e.message);
    }
}
