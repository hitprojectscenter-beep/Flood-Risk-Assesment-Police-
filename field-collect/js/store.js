// שכבת נתונים: Supabase (הרשמה + מסד נתונים + אחסון תמונות), עם נפילה
// אוטומטית ל"מצב הדגמה" מקומי (IndexedDB) כשהשרת אינו זמין / לא הוגדר.
//
// ממשק אחיד לשני המימושים:
//   mode, reason
//   getUser() → {id,phone,first,last,name} | null      onAuth(cb)
//   sendOtp({phone,first,last}) → {demoCode?}      (phone בפורמט E.164: +9725XXXXXXXX)
//   verifyOtp({phone,code,first,last})              signOut()
//   user = {id, phone, first, last, name}
//   listPoints() → [point]     subscribe(cb)
//   createPoint(fields, blobs, onProgress)
//   updatePoint(point, fields, newBlobs, removedPaths, onProgress)
//   deletePoint(point)
// point = {id,user_id,location_name,reporter_name,notes,lat,lng,accuracy_m,
//          photo_paths:[], photos:[url], created_at, updated_at}
import { SUPABASE_URL, SUPABASE_KEY, TABLE, PHOTO_BUCKET } from './config.js';
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

    let user = null;
    const norm = u => {
        if (!u) return null;
        const md = u.user_metadata || {};
        const name = md.display_name || [md.first_name, md.last_name].filter(Boolean).join(' ') || u.phone || 'משתמש';
        return { id: u.id, phone: u.phone ? '+' + String(u.phone).replace(/^\+/, '') : '', first: md.first_name || '', last: md.last_name || '', name };
    };
    const { data: { session } } = await sb.auth.getSession();
    user = norm(session && session.user);

    const authCbs = [];
    sb.auth.onAuthStateChange((_e, s) => {
        // setTimeout — מונע deadlock של supabase-js כשקוראים ל-API מתוך ה-callback
        setTimeout(() => { user = norm(s && s.user); authCbs.forEach(cb => cb(user)); }, 0);
    });

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
        return user;
    }

    return {
        mode: 'cloud',
        reason: '',
        getUser: () => user,
        onAuth: cb => authCbs.push(cb),

        async sendOtp({ phone, first, last }) {
            const { error } = await sb.auth.signInWithOtp({
                phone, options: { data: { first_name: first, last_name: last, display_name: first + ' ' + last } }
            });
            if (error) throw new Error(hebAuthError(error));
            return {};
        },
        async verifyOtp({ phone, code, first, last }) {
            const { data, error } = await sb.auth.verifyOtp({ phone, token: code, type: 'sms' });
            if (error) throw new Error(hebAuthError(error));
            // עדכון השם גם למשתמש קיים (metadata של הרשמה נשמר רק בפעם הראשונה)
            const upd = await sb.auth.updateUser({ data: { first_name: first, last_name: last, display_name: first + ' ' + last } });
            user = norm((upd.data && upd.data.user) || data.user);
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
                throw new Error('שמירת הנקודה נכשלה: ' + error.message);
            }
            return hydrate(data);
        },

        async updatePoint(point, fields, newBlobs, removedPaths, onProgress) {
            const u = requireUser();
            const added = await uploadAll(u.id, point.id, newBlobs, onProgress);
            const kept = point.photo_paths.filter(p => !removedPaths.includes(p));
            const { data, error } = await sb.from(TABLE)
                .update({ ...fields, photo_paths: kept.concat(added), updated_at: new Date().toISOString() })
                .eq('id', point.id).select().single();
            if (error) {
                if (added.length) await sb.storage.from(PHOTO_BUCKET).remove(added);
                throw new Error('עדכון הנקודה נכשל: ' + error.message);
            }
            if (removedPaths.length) await sb.storage.from(PHOTO_BUCKET).remove(removedPaths);
            return hydrate(data);
        },

        async deletePoint(point) {
            requireUser();
            const { error } = await sb.from(TABLE).delete().eq('id', point.id);
            if (error) throw new Error('מחיקה נכשלה: ' + error.message);
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
    const USERS = 'fc_demo_phone_users', SESSION = 'fc_demo_phone_session';
    let pendingOtp = null;
    const readUsers = () => { try { return JSON.parse(localStorage.getItem(USERS)) || {}; } catch (_) { return {}; } };
    let user = null;
    try { user = JSON.parse(localStorage.getItem(SESSION)); } catch (_) { }
    const authCbs = [];
    const setUser = u => {
        user = u;
        if (u) localStorage.setItem(SESSION, JSON.stringify(u)); else localStorage.removeItem(SESSION);
        authCbs.forEach(cb => cb(user));
    };

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
        if (!user) throw new Error('יש להתחבר כדי לבצע פעולה זו');
        if (point && point.user_id !== user.id) throw new Error('ניתן לערוך רק נקודות שהזנת');
    }

    const listeners = [];
    const changed = () => listeners.forEach(cb => cb());

    return {
        mode: 'demo',
        reason: reason || '',
        getUser: () => user,
        onAuth: cb => authCbs.push(cb),

        // מצב הדגמה: אין שליחת SMS אמיתית — הקוד מוצג על המסך
        async sendOtp({ phone }) {
            const code = String(Math.floor(100000 + Math.random() * 900000));
            pendingOtp = { phone, code, exp: Date.now() + 5 * 60000 };
            return { demoCode: code };
        },
        async verifyOtp({ phone, code, first, last }) {
            if (!pendingOtp || pendingOtp.phone !== phone || Date.now() > pendingOtp.exp || pendingOtp.code !== code)
                throw new Error('הקוד שגוי או שפג תוקפו — בקשו קוד חדש');
            pendingOtp = null;
            const users = readUsers();
            if (!users[phone]) users[phone] = { id: crypto.randomUUID() };
            Object.assign(users[phone], { first, last });
            localStorage.setItem(USERS, JSON.stringify(users));
            setUser({ id: users[phone].id, phone, first, last, name: first + ' ' + last });
        },
        async signOut() { setUser(null); },

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
            const row = { id, user_id: user.id, ...fields, photo_paths: paths, created_at: now, updated_at: now };
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
