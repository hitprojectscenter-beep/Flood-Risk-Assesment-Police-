// יומן שטח — בקר ראשי: מפה, דקירת נקודה, טופס הזנה, צפייה, רשימה, ייצוא.
import { createStore } from './store.js';
import { resizeImage } from './photos.js';
import { govmapAllowed, isGovmapActive, showGovmap, hideGovmap, moveTo as gmMoveTo, drawPoints as gmDrawPoints, markLocation as gmMark } from './govmap.js';
import { searchPlaces } from './search.js';
import { MAX_PHOTOS, MAP_CENTER, MAP_ZOOM, BRAND, LAYERS, EXTRA_FIELDS, ADMIN_PHONES, CONTACT_PHONE, SEARCH_TYPES } from './config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const fmtCoord = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
const ms = name => `<span class="ms">${name}</span>`;                 // Material Symbols icon
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { } };

let store = null;
let points = [];
let pendingAfterLogin = null;

// ============================================================================
// Toast
// ============================================================================
let toastTimer = null;
function toast(text, kind = '') {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ============================================================================
// Sheets
// ============================================================================
const SHEETS = ['authSheet', 'formSheet', 'detailSheet', 'listSheet', 'layersSheet', 'searchSheet'];
function openSheet(id) {
    SHEETS.forEach(s => { if (s !== id) $(s).classList.remove('open'); });
    $(id).classList.add('open');
    $('backdrop').classList.toggle('show', id !== 'formSheet' && id !== 'detailSheet');
    document.body.classList.add('sheet-open');
}
function closeSheet(id) {
    $(id).classList.remove('open');
    if (!SHEETS.some(s => $(s).classList.contains('open'))) {
        $('backdrop').classList.remove('show');
        document.body.classList.remove('sheet-open');
    }
    if (id === 'formSheet') clearDraft();
    if (id === 'detailSheet') { highlight(null); setUrlPoint(null); }
}
// קישור ישיר לנקודה (?p=id) — לשיתוף ולרענון
function setUrlPoint(id) {
    const params = new URLSearchParams(location.search);
    if (id) params.set('p', id); else params.delete('p');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet(b.closest('.sheet').id)));
$('backdrop').addEventListener('click', () => SHEETS.forEach(s => { if (s !== 'formSheet') closeSheet(s); }));
// גרירת ידית הגיליון כלפי מטה סוגרת אותו
document.querySelectorAll('.sheet').forEach(sheet => {
    let y0 = null;
    sheet.querySelector('.sheet-handle').addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    sheet.querySelector('.sheet-handle').addEventListener('touchend', e => {
        if (y0 != null && e.changedTouches[0].clientY - y0 > 50) closeSheet(sheet.id);
        y0 = null;
    });
});

// ============================================================================
// Map (שכבות בסיס מ-field-nav-app + TSRS)
// ============================================================================
const map = L.map('map', { zoomControl: false, center: MAP_CENTER, zoom: MAP_ZOOM });
L.control.zoom({ position: 'topleft' }).addTo(map);
window.__fieldCollect = { map };          // גישה לקריאה בלבד לבדיקות QA
L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

// שכבות (js/config.js → LAYERS): OSM · אורתופוטו מפ"י · מבנים מפ"י
const layerDef = l => (l.type === 'govmap'
    ? (govmapAllowed() ? { govmap: true, sub: l.sub, pending: false }
        : l.fallback ? { url: l.fallback.url, opt: l.fallback.opt, sub: l.fallback.sub, pending: true }
            : { url: '', sub: 'זמין בדומיין המורשה ל-GovMap', pending: true })
    : l.url ? { url: l.url, opt: l.opt, sub: l.sub, pending: false }
    : l.fallback ? { url: l.fallback.url, opt: l.fallback.opt, sub: l.fallback.sub, pending: true }
        : { url: '', opt: l.opt, sub: 'ממתינה לחיבור', pending: true });
const makeLayer = l => {
    const d = layerDef(l);
    if (!d.url) return null;
    return l.type === 'wms' ? L.tileLayer.wms(d.url, d.opt) : L.tileLayer(d.url, d.opt);   // govmap חלופי → אריחי fallback
};
const BASES = LAYERS.filter(l => l.group === 'base');
const OVERLAYS = LAYERS.filter(l => l.group === 'overlay');
let baseLayer = null;
let baseKey = localStorage.getItem('fc_base2') || BASES[0].id;
if (!BASES.some(l => l.id === baseKey)) baseKey = BASES[0].id;
// ---- GovMap: מפת המרכז למיפוי ישראל, מוצגת מעל Leaflet ומסונכרנת איתו ----
let gmSync = false;                       // תזוזת Leaflet שמקורה ב-GovMap (לא להחזיר אליו)
const gmHandlers = {
    onClick: ll => { if (placing) setDraft(L.latLng(ll.lat, ll.lng), null); },
    onPoint: id => openDetail(id),
    onExtent: (ll, z) => { gmSync = true; map.setView([ll.lat, ll.lng], z == null ? map.getZoom() : z, { animate: false }); gmSync = false; }
};
map.on('moveend', () => { if (isGovmapActive() && !gmSync) gmMoveTo(map.getCenter(), map.getZoom()); });
function gmRedraw() {
    if (!isGovmapActive()) return;
    const u = store && store.getUser();
    try { gmDrawPoints(points, { mineId: u && u.id, draft }); } catch (e) { console.warn('GovMap draw', e); }
}
function markBase(key) {
    baseKey = key;
    try { localStorage.setItem('fc_base2', key); } catch (_) { }
    document.querySelectorAll('#baseLayers .layer-card').forEach(c => c.classList.toggle('active', c.dataset.key === key));
}
function setBase(key) {
    const def = BASES.find(l => l.id === key);
    const d = layerDef(def);
    if (d.govmap) {
        showGovmap({ background: def.background, center: map.getCenter(), zoom: map.getZoom() }, gmHandlers)
            .then(() => { markBase(key); gmRedraw(); })
            .catch(err => {
                console.warn('GovMap', err);
                hideGovmap();
                toast('טעינת מפת GovMap נכשלה — מוצגת מפת OSM', 'err');
                if (key !== BASES[0].id) setBase(BASES[0].id);
            });
        return;
    }
    const lyr = makeLayer(def);
    if (!lyr) return toast(def.type === 'govmap' ? 'מפת GovMap זמינה רק בכתובת המורשית של היישום' : 'שכבה זו ממתינה לחיבור שירות', 'err');
    hideGovmap();
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = lyr.addTo(map);
    baseLayer.bringToBack();
    markBase(key);
}
const isMapi = l => l.id.startsWith('mapi');
$('baseLayers').innerHTML = BASES.map(l => {
    const d = layerDef(l);
    return `<button class="layer-card" data-key="${l.id}">
        <span class="ic">${ms(l.icon)}</span><b>${esc(l.label)}</b><small>${esc(d.sub)}</small>
        ${isMapi(l) ? `<span class="badge-mapi ${d.pending ? 'badge-wait' : ''}">${d.pending ? 'חלופי' : 'GovMap'}</span>` : ''}
    </button>`;
}).join('');
$('baseLayers').addEventListener('click', e => {
    const c = e.target.closest('.layer-card');
    if (c) { setBase(c.dataset.key); buzz(8); }
});
setBase(baseKey);

const overlayOn = new Map();
$('overlaySec').hidden = $('overlayLayers').hidden = !OVERLAYS.length;
$('overlayLayers').innerHTML = OVERLAYS.map(l => {
    const d = layerDef(l);
    return `<label class="overlay-row">
        <span class="ic">${ms(l.icon)}</span>
        <span class="txt"><b>${esc(l.label)}</b><small>${esc(d.url ? d.sub : 'ממתינה לחיבור שירות')}</small>
            ${isMapi(l) ? `<span class="badge-mapi ${d.pending ? 'badge-wait' : ''}">${d.pending ? 'ממתין לחיבור מפ"י' : 'מפ"י'}</span>` : ''}</span>
        <span class="switch"><input type="checkbox" data-key="${l.id}" ${d.url ? '' : 'disabled'}><span></span></span>
    </label>`;
}).join('');
$('overlayLayers').addEventListener('change', e => {
    const key = e.target.dataset.key;
    const def = OVERLAYS.find(l => l.id === key);
    if (e.target.checked) { const lyr = makeLayer(def); if (lyr) overlayOn.set(key, lyr.addTo(map)); }
    else if (overlayOn.has(key)) { map.removeLayer(overlayOn.get(key)); overlayOn.delete(key); }
});
$('layersBtn').addEventListener('click', () => openSheet('layersSheet'));

// ---- המיקום שלי ----
let meMarker = null, meCircle = null;
function getGps() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('הדפדפן אינו תומך באיתור מיקום'));
        navigator.geolocation.getCurrentPosition(
            p => resolve(p.coords),
            e => reject(new Error(e.code === 1 ? 'הגישה למיקום נחסמה — אפשרו הרשאת מיקום בדפדפן' : 'לא ניתן לאתר מיקום (' + e.message + ')')),
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
        );
    });
}
function showMe(c) {
    const ll = [c.latitude, c.longitude];
    if (!meMarker) {
        meMarker = L.marker(ll, { interactive: false, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
        meCircle = L.circle(ll, { radius: c.accuracy, color: '#3B82F6', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
    } else {
        meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(c.accuracy);
    }
    return ll;
}
$('locateBtn').addEventListener('click', async () => {
    $('locateBtn').classList.add('busy');
    try {
        const c = await getGps();
        map.flyTo(showMe(c), Math.max(map.getZoom(), 16));
    } catch (e) { toast(e.message, 'err'); }
    $('locateBtn').classList.remove('busy');
});

// ============================================================================
// Markers
// ============================================================================
const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true });
map.addLayer(cluster);
const markers = new Map();

function pinIcon(p, active) {
    const mine = store && store.getUser() && store.getUser().id === p.user_id;
    const n = p.photo_paths.length;
    return L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin ${mine ? 'mine' : ''} ${active ? 'active' : ''}">${ms(n ? 'photo_camera' : 'location_on')}${n > 1 ? `<b>${n}</b>` : ''}</div>`,
        iconSize: [34, 42], iconAnchor: [17, 40]
    });
}
function renderMarkers() {
    cluster.clearLayers();
    markers.clear();
    points.forEach(p => {
        const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.location_name });
        m.on('click', () => openDetail(p.id));
        markers.set(p.id, m);
    });
    cluster.addLayers([...markers.values()]);
    updateStats();
    gmRedraw();
}
// מונים מונפשים (כותרת + מסך פתיחה)
function countTo(el, n) {
    const from = +el.dataset.n || 0;
    el.dataset.n = n;
    const t0 = performance.now(), dur = 900;
    const step = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(from + (n - from) * e).toLocaleString('he-IL');
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
function updateStats() {
    const photos = points.reduce((s, p) => s + p.photo_paths.length, 0);
    const users = new Set(points.map(p => p.user_id)).size;
    countTo($('pointCount'), points.length);
    countTo($('statPhotos'), photos);
    countTo($('splashPoints'), points.length);
    countTo($('splashPhotos'), photos);
    countTo($('splashUsers'), users);
}
function ripple(latlng) {
    const pt = map.latLngToContainerPoint(latlng);
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = pt.x + 'px'; r.style.top = pt.y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 1000);
}
let highlighted = null;
function highlight(id) {
    if (highlighted && markers.has(highlighted)) {
        const p = points.find(x => x.id === highlighted);
        if (p) markers.get(highlighted).setIcon(pinIcon(p));
    }
    highlighted = id;
    if (id && markers.has(id)) markers.get(id).setIcon(pinIcon(points.find(x => x.id === id), true));
}
// הזזת המפה כך שהנקודה תופיע מעל הגיליון הפתוח
function focusAbove(latlng, zoom) {
    const z = zoom || map.getZoom();
    const pt = map.project(latlng, z).add([0, window.innerHeight * 0.22]);
    map.setView(map.unproject(pt, z), z, { animate: true });
}

async function loadPoints() {
    try {
        points = await store.listPoints();
        renderMarkers();
        if ($('listSheet').classList.contains('open')) renderList();
        if (detailId && $('detailSheet').classList.contains('open')) {
            if (points.some(p => p.id === detailId)) renderDetail(detailId); else closeSheet('detailSheet');
        }
    } catch (e) {
        toast('טעינת הנקודות נכשלה: ' + e.message, 'err');
    }
}

// ============================================================================
// Auth
// ============================================================================
// ---- הזדהות בנייד + קוד SMS ----
// 050-1234567 / 0501234567 / +972501234567 → +972501234567
function normPhone(v) {
    let d = String(v || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+972')) d = '0' + d.slice(4);
    else if (d.startsWith('972')) d = '0' + d.slice(3);
    return /^05\d{8}$/.test(d) ? '+972' + d.slice(1) : null;
}
const prettyPhone = e164 => e164 ? ('0' + e164.slice(4)).replace(/^(\d{3})(\d+)$/, '$1-$2') : '';
let otpCtx = null;              // { phone, first, last }
let resendTimer = null;
function authStep(n) {
    $('authForm').hidden = n !== 1;
    $('otpForm').hidden = n !== 2;
    $('stepDot1').className = n === 1 ? 'on' : 'done';
    $('stepDot2').className = n === 2 ? 'on' : '';
    setMsg('authMsg', ''); setMsg('otpMsg', '');
}
function startResendCountdown() {
    let left = 45;
    const b = $('otpResend');
    clearInterval(resendTimer);
    b.disabled = true;
    const tick = () => {
        b.textContent = left > 0 ? `שליחה חוזרת (${left})` : 'שליחה חוזרת';
        if (left-- <= 0) { clearInterval(resendTimer); b.disabled = false; }
    };
    tick();
    resendTimer = setInterval(tick, 1000);
}
async function sendCode() {
    const r = await store.sendOtp(otpCtx);
    $('otpPhone').textContent = prettyPhone(otpCtx.phone);
    $('otpForm').querySelectorAll('.demo-code').forEach(el => el.remove());
    if (r && r.demoCode) {
        const d = document.createElement('div');
        d.className = 'demo-code';
        d.innerHTML = `מצב הדגמה — לא נשלח SMS אמיתי. הקוד: <b dir="ltr">${r.demoCode}</b>`;
        $('otpMsg').after(d);
    }
    startResendCountdown();
}
function setAuthTab() { authStep(otpCtx ? 2 : 1); }   // תאימות לקוד קיים (requireLogin)

function setMsg(id, text, ok) {
    const el = $(id);
    el.textContent = text;
    el.className = 'msg' + (text ? (ok ? ' ok' : ' err') : '');
}

function openAuth(note) {
    const u = store.getUser();
    $('authLoggedOut').hidden = !!u;
    $('authLoggedIn').hidden = !u;
    $('authNote').hidden = !note;
    $('authNote').textContent = note || '';
    if (u) {
        $('profAvatar').textContent = (u.name || '?').trim().charAt(0);
        $('profName').textContent = u.name;
        $('profPhone').textContent = prettyPhone(u.phone);
        const mine = points.filter(p => p.user_id === u.id);
        const photos = mine.reduce((s, p) => s + p.photo_paths.length, 0);
        $('profStats').innerHTML = `<div><b>${mine.length}</b><span>נקודות</span></div><div><b>${photos}</b><span>תמונות</span></div>`;
    }
    openSheet('authSheet');
}
$('userBtn').addEventListener('click', () => openAuth());

$('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const first = $('authFirst').value.trim(), last = $('authLast').value.trim(), phone = normPhone($('authPhone').value);
    if (!first) { setMsg('authMsg', 'יש להזין שם פרטי', false); return $('authFirst').focus(); }
    if (!last) { setMsg('authMsg', 'יש להזין שם משפחה', false); return $('authLast').focus(); }
    if (!phone) { setMsg('authMsg', 'מספר נייד לא תקין — לדוגמה 050-1234567', false); return $('authPhone').focus(); }
    const btn = $('authSubmit');
    btn.disabled = true;
    setMsg('authMsg', 'שולח קוד…', true);
    try {
        otpCtx = { phone, first, last };
        await sendCode();
        authStep(2);
        $('otpCode').value = '';
        setTimeout(() => $('otpCode').focus(), 300);
    } catch (err) {
        otpCtx = null;
        setMsg('authMsg', err.message, false);
    } finally {
        btn.disabled = false;
    }
});
$('otpForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('otpCode').value.replace(/\D/g, '');
    if (code.length !== 6) return setMsg('otpMsg', 'יש להזין את 6 ספרות הקוד', false);
    const btn = $('otpSubmit');
    btn.disabled = true;
    setMsg('otpMsg', 'מאמת…', true);
    try {
        await store.verifyOtp({ ...otpCtx, code });
        otpCtx = null;
        clearInterval(resendTimer);
        authStep(1);
        closeSheet('authSheet');
        buzz([15, 40, 15]);
        toast('ברוך/ה הבא/ה, ' + store.getUser().name, 'ok');
        if (pendingAfterLogin) { const f = pendingAfterLogin; pendingAfterLogin = null; f(); }
    } catch (err) {
        setMsg('otpMsg', err.message, false);
        $('otpCode').select();
    } finally {
        btn.disabled = false;
    }
});
// שליחה אוטומטית כשהוזנו 6 ספרות (כולל מילוי אוטומטי מה-SMS)
$('otpCode').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('otpForm').requestSubmit();
});
$('otpResend').addEventListener('click', async () => {
    try { await sendCode(); setMsg('otpMsg', 'נשלח קוד חדש', true); } catch (err) { setMsg('otpMsg', err.message, false); }
});
$('otpBack').addEventListener('click', () => { otpCtx = null; clearInterval(resendTimer); authStep(1); $('authPhone').focus(); });
$('logoutBtn').addEventListener('click', async () => {
    await store.signOut();
    closeSheet('authSheet');
    toast('התנתקת');
});
$('myPointsBtn').addEventListener('click', () => { $('listMine').checked = true; openList(); });

// מנהל = משתמש מאומת (SMS) שמספרו ב-ADMIN_PHONES
const isAdmin = () => { const u = store && store.getUser(); return !!(u && ADMIN_PHONES.includes(u.phone)); };

function onAuthChanged() {
    const u = store.getUser();
    document.body.classList.toggle('is-admin', isAdmin());
    $('userBtnLabel').textContent = u ? u.name : 'כניסה / הרשמה';
    $('userBtn').classList.toggle('logged', !!u);
    renderMarkers();
    if (detailId && $('detailSheet').classList.contains('open')) renderDetail(detailId);
}

function requireLogin(action, note) {
    if (store.getUser()) return true;
    pendingAfterLogin = action;
    setAuthTab();
    openAuth(note || 'יש להתחבר או להירשם כדי לדקור נקודה ולהזין נתונים');
    return false;
}

// ============================================================================
// Placing a point (דקירה)
// ============================================================================
let placing = false;
let draft = null;           // { lat, lng, accuracy_m }
let draftMarker = null;
let relocating = false;

function startPlacing(relocate = false) {
    placing = true;
    relocating = relocate;
    document.body.classList.add('placing');
    $('placeBanner').hidden = false;
    SHEETS.forEach(s => $(s).classList.remove('open'));
    document.body.classList.remove('sheet-open');
    $('backdrop').classList.remove('show');
}
function stopPlacing() {
    placing = false;
    document.body.classList.remove('placing');
    $('placeBanner').hidden = true;
}
$('addBtn').addEventListener('click', () => {
    if (!requireLogin(() => startPlacing())) return;
    if (placing) { stopPlacing(); return; }
    clearDraft();
    startPlacing();
});
$('placeCancelBtn').addEventListener('click', () => {
    stopPlacing();
    if (relocating) openSheet('formSheet'); else clearDraft();
});
$('placeGpsBtn').addEventListener('click', async () => {
    const b = $('placeGpsBtn');
    b.disabled = true; b.textContent = '⏳ מאתר…';
    try {
        const c = await getGps();
        showMe(c);
        setDraft({ lat: c.latitude, lng: c.longitude }, Math.round(c.accuracy));
    } catch (e) { toast(e.message, 'err'); }
    b.disabled = false; b.textContent = '🎯 המיקום שלי';
});
map.on('click', e => { if (placing) setDraft(e.latlng, null); });

function setDraft(latlng, accuracy) {
    stopPlacing();
    buzz(15);
    draft = { lat: latlng.lat, lng: latlng.lng, accuracy_m: accuracy };
    if (!draftMarker) {
        draftMarker = L.marker(latlng, {
            draggable: true, zIndexOffset: 1000,
            icon: L.divIcon({ className: 'pin-wrap', html: `<div class="pin draft">${ms('add_location_alt')}</div>`, iconSize: [34, 42], iconAnchor: [17, 40] })
        }).addTo(map);
        draftMarker.on('dragend', () => {
            const ll = draftMarker.getLatLng();
            draft = { lat: ll.lat, lng: ll.lng, accuracy_m: null };
            updateFormCoords();
        });
    } else {
        draftMarker.setLatLng(latlng);
    }
    if (relocating) { relocating = false; updateFormCoords(); openSheet('formSheet'); }
    else openForm();
    focusAbove(latlng, Math.max(map.getZoom(), 15));
    gmRedraw();
}
function clearDraft() {
    draft = null;
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
    if (editing && markers.has(editing.id)) markers.get(editing.id).setOpacity(1);
    editing = null;
    gmRedraw();
}
function updateFormCoords() {
    if (!draft) return;
    $('formCoords').textContent = fmtCoord(draft.lat, draft.lng) + (draft.accuracy_m ? ` (±${draft.accuracy_m}m)` : '');
}
$('formRelocate').addEventListener('click', () => startPlacing(true));

// ============================================================================
// Form
// ============================================================================
let editing = null;         // point being edited
let keptPhotos = [];        // [{path,url}] existing photos kept (edit mode)
let newPhotos = [];         // [{blob,url}] new photos

function openForm(point) {
    editing = point || null;
    $('formTitle').textContent = editing ? 'עריכת נקודה' : 'נקודה חדשה';
    $('fName').value = editing ? editing.location_name : '';
    $('fReporter').value = editing ? editing.reporter_name : (localStorage.getItem('fc_reporter') || store.getUser().name || '');
    $('fNotes').value = editing ? (editing.notes || '') : '';
    EXTRA_FIELDS.forEach(f => { $('x_' + f.key).value = editing ? (editing[f.key] || '') : ''; });
    newPhotos.forEach(p => URL.revokeObjectURL(p.url));
    newPhotos = [];
    keptPhotos = editing ? editing.photo_paths.map((path, i) => ({ path, url: editing.photos[i] })) : [];
    setMsg('formMsg', '');
    renderPhotoGrid();
    updateFormCoords();
    openSheet('formSheet');
    if (!editing) setTimeout(() => $('fName').focus({ preventScroll: true }), 350);
}
$('formClose').addEventListener('click', () => {
    if (($('fName').value || $('fNotes').value || newPhotos.length) && !editing &&
        !confirm('לבטל את הנקודה? הנתונים שהוזנו יימחקו')) return;
    closeSheet('formSheet');
});

// ---- שדות נוספים + השלמה אוטומטית מתוך בסיס הנתונים ----
let managedOptions = [];                  // [{field, value}] מטבלת field_options
$('extraFields').innerHTML = EXTRA_FIELDS.map(f => `
    <label class="field ac-wrap">
        <span>${ms(f.icon)} ${esc(f.label)}</span>
        <input id="x_${f.key}" data-key="${f.key}" type="text" maxlength="200" autocomplete="off" placeholder="${esc(f.placeholder || '')}"
               role="combobox" aria-autocomplete="list" aria-expanded="false">
        <ul class="ac-list" role="listbox" hidden></ul>
    </label>`).join('');
function suggestionsFor(key, q) {
    const count = new Map();
    const add = (v, w) => { v = (v || '').trim(); if (v) count.set(v, (count.get(v) || 0) + w); };
    managedOptions.filter(o => o.field === key).forEach(o => add(o.value, 1000));   // רשימה מנוהלת קודמת
    points.forEach(p => add(p[key], 1));
    q = (q || '').trim().toLowerCase();
    return [...count.entries()]
        .filter(([v]) => !q || (v.toLowerCase().includes(q) && v.toLowerCase() !== q))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))
        .slice(0, 8).map(([v]) => v);
}
function showAc(input) {
    const list = input.nextElementSibling;
    const items = suggestionsFor(input.dataset.key, input.value);
    const q = input.value.trim();
    list.innerHTML = items.map((v, i) => {
        const at = q ? v.toLowerCase().indexOf(q.toLowerCase()) : -1;
        const html = at >= 0 ? esc(v.slice(0, at)) + '<mark>' + esc(v.slice(at, at + q.length)) + '</mark>' + esc(v.slice(at + q.length)) : esc(v);
        return `<li role="option" data-i="${i}">${html}</li>`;
    }).join('');
    list._items = items;
    list._sel = -1;
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
}
function hideAc(input) { input.nextElementSibling.hidden = true; input.setAttribute('aria-expanded', 'false'); }
$('extraFields').addEventListener('focusin', e => { if (e.target.matches('input')) showAc(e.target); });
$('extraFields').addEventListener('input', e => { if (e.target.matches('input')) showAc(e.target); });
$('extraFields').addEventListener('focusout', e => { if (e.target.matches('input')) setTimeout(() => hideAc(e.target), 150); });
$('extraFields').addEventListener('pointerdown', e => {
    const li = e.target.closest('.ac-list li');
    if (!li) return;
    e.preventDefault();                                  // שומר את הפוקוס בשדה
    const list = li.parentElement, input = list.previousElementSibling;
    input.value = list._items[+li.dataset.i];
    hideAc(input);
    buzz(6);
});
$('extraFields').addEventListener('keydown', e => {
    if (!e.target.matches('input')) return;
    const list = e.target.nextElementSibling;
    if (list.hidden) return;
    const lis = list.querySelectorAll('li');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        list._sel = (list._sel + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
        lis.forEach((li, i) => li.classList.toggle('sel', i === list._sel));
    } else if (e.key === 'Enter' && list._sel >= 0) {
        e.preventDefault();
        e.target.value = list._items[list._sel];
        hideAc(e.target);
    } else if (e.key === 'Escape') hideAc(e.target);
});

function renderPhotoGrid() {
    const grid = $('photoGrid');
    grid.querySelectorAll('.thumb').forEach(t => t.remove());
    const all = keptPhotos.map((p, i) => ({ url: p.url, kind: 'kept', i })).concat(newPhotos.map((p, i) => ({ url: p.url, kind: 'new', i })));
    const first = $('photoAddCamera');
    all.forEach(p => {
        const d = document.createElement('div');
        d.className = 'thumb';
        d.innerHTML = `<img src="${esc(p.url)}" alt=""><button type="button" aria-label="הסרת תמונה">✕</button>`;
        d.querySelector('button').addEventListener('click', () => {
            if (p.kind === 'kept') keptPhotos.splice(p.i, 1);
            else { URL.revokeObjectURL(newPhotos[p.i].url); newPhotos.splice(p.i, 1); }
            renderPhotoGrid();
        });
        grid.insertBefore(d, first);
    });
    const n = all.length;
    $('photoCount').textContent = `(${n}/${MAX_PHOTOS})`;
    $('photoAddCamera').hidden = $('photoAddGallery').hidden = n >= MAX_PHOTOS;
}

async function addFiles(files) {
    const room = MAX_PHOTOS - keptPhotos.length - newPhotos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast(`ניתן לצרף עד ${MAX_PHOTOS} תמונות לנקודה`, 'err');
    for (const f of list) {
        try {
            const blob = await resizeImage(f);
            newPhotos.push({ blob, url: URL.createObjectURL(blob) });
            renderPhotoGrid();
        } catch (e) { toast(e.message, 'err'); }
    }
}
['fCamera', 'fPhotos'].forEach(id => $(id).addEventListener('change', async e => {
    await addFiles(e.target.files);
    e.target.value = '';
}));

$('pointForm').addEventListener('submit', async e => {
    e.preventDefault();
    const location_name = $('fName').value.trim(), reporter_name = $('fReporter').value.trim(), notes = $('fNotes').value.trim();
    if (!location_name) { setMsg('formMsg', 'יש להזין שם מיקום', false); return $('fName').focus(); }
    if (!reporter_name) { setMsg('formMsg', 'יש להזין שם מזין', false); return $('fReporter').focus(); }
    if (!draft) return setMsg('formMsg', 'יש לבחור מיקום במפה', false);
    if (!store.getUser()) return requireLogin(() => openSheet('formSheet'), 'פג תוקף החיבור — יש להתחבר מחדש');

    const btn = $('formSubmit');
    btn.disabled = true;
    const progress = (i, n) => setMsg('formMsg', `מעלה תמונה ${i} מתוך ${n}…`, true);
    setMsg('formMsg', 'שומר…', true);
    const fields = { location_name, reporter_name, notes, lat: draft.lat, lng: draft.lng, accuracy_m: draft.accuracy_m };
    EXTRA_FIELDS.forEach(f => { fields[f.key] = $('x_' + f.key).value.trim(); });
    try {
        let saved;
        if (editing) {
            const removed = editing.photo_paths.filter(p => !keptPhotos.some(k => k.path === p));
            saved = await store.updatePoint(editing, fields, newPhotos.map(p => p.blob), removed, progress);
        } else {
            saved = await store.createPoint(fields, newPhotos.map(p => p.blob), progress);
        }
        try { localStorage.setItem('fc_reporter', reporter_name); } catch (_) { }
        const wasEdit = !!editing;
        closeSheet('formSheet');
        await loadPoints();
        toast(wasEdit ? 'הנקודה עודכנה ✓' : 'הנקודה נשמרה ✓', 'ok');
        buzz([20, 60, 20]);
        setTimeout(() => ripple([saved.lat, saved.lng]), 450);
        openDetail(saved.id);
    } catch (err) {
        setMsg('formMsg', err.message, false);
    } finally {
        btn.disabled = false;
    }
});

// ============================================================================
// Detail
// ============================================================================
let detailId = null;
let lbList = [], lbIdx = 0;

function openDetail(id) {
    const p = points.find(x => x.id === id);
    if (!p) return;
    detailId = id;
    renderDetail(id);
    openSheet('detailSheet');
    highlight(id);
    focusAbove([p.lat, p.lng], Math.max(map.getZoom(), 15));
    setUrlPoint(id);
}

function renderDetail(id) {
    const p = points.find(x => x.id === id);
    if (!p) return;
    const u = store.getUser();
    const mine = u && u.id === p.user_id;
    const edited = p.updated_at && p.updated_at.slice(0, 16) !== p.created_at.slice(0, 16);
    const n = p.photos.length;
    $('detailSheet').classList.toggle('has-hero', n > 0);
    $('detailBody').innerHTML = `
        ${n ? `<div class="hero">
            <div class="hero-track">${p.photos.map((url, i) =>
                `<button class="dphoto" data-i="${i}"><img src="${esc(url)}" alt="תמונה ${i + 1}" ${i ? 'loading="lazy"' : ''}></button>`).join('')}</div>
            ${n > 1 ? `<span class="hero-count">${ms('photo_library')} ${n} תמונות · החליקו</span>` : ''}
        </div>` : ''}
        <h2 class="detail-title">${esc(p.location_name)}</h2>
        <div class="detail-meta">
            <span>${ms('person')} ${esc(p.reporter_name)}</span>
            <span>${ms('schedule')} ${esc(fmtDate(p.created_at))}</span>
            ${edited ? `<span>${ms('edit')} עודכן ${esc(fmtDate(p.updated_at))}</span>` : ''}
        </div>
        <div class="coords-row">
            <span class="coords" dir="ltr">${fmtCoord(p.lat, p.lng)}${p.accuracy_m ? ` (±${p.accuracy_m}m)` : ''}</span>
            <button class="btn btn-xs btn-ghost" data-act="copy">${ms('content_copy')} העתקה</button>
        </div>
        ${EXTRA_FIELDS.some(f => p[f.key]) ? `<div class="info-grid">${EXTRA_FIELDS.filter(f => p[f.key]).map(f =>
            `<div class="info-cell">${ms(f.icon)}<div><small>${esc(f.label)}</small><b>${esc(p[f.key])}</b></div></div>`).join('')}</div>` : ''}
        ${p.notes ? `<div class="detail-notes">${esc(p.notes)}</div>` : '<div class="muted small" style="margin-bottom:12px">אין הערות</div>'}
        <div class="detail-actions">
            <a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">${ms('navigation')} ניווט</a>
            <a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes">${ms('directions_car')} Waze</a>
            <button class="btn btn-sm btn-ghost" data-act="share">${ms('share')} שיתוף</button>
            ${mine ? `<button class="btn btn-sm btn-ghost" data-act="edit">${ms('edit')} עריכה</button>
                      <button class="btn btn-sm btn-danger" data-act="delete">${ms('delete')} מחיקה</button>` : ''}
        </div>`;
}

$('detailBody').addEventListener('click', async e => {
    const p = points.find(x => x.id === detailId);
    if (!p) return;
    const ph = e.target.closest('.dphoto');
    if (ph) return openLightbox(p.photos, +ph.dataset.i);
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const link = location.origin + location.pathname + '?p=' + p.id;
    switch (act.dataset.act) {
        case 'copy':
            try { await navigator.clipboard.writeText(fmtCoord(p.lat, p.lng)); toast('הקואורדינטות הועתקו ✓', 'ok'); }
            catch (_) { prompt('קואורדינטות:', fmtCoord(p.lat, p.lng)); }
            break;
        case 'share':
            try {
                if (navigator.share) await navigator.share({ title: p.location_name, text: p.location_name + ' — יומן שטח', url: link });
                else { await navigator.clipboard.writeText(link); toast('הקישור הועתק ✓', 'ok'); }
            } catch (_) { }
            break;
        case 'edit':
            closeSheet('detailSheet');
            relocating = true;   // מציב סמן גריר בלי לפתוח טופס "נקודה חדשה"
            setDraft(L.latLng(p.lat, p.lng), p.accuracy_m);
            if (markers.has(p.id)) markers.get(p.id).setOpacity(0);
            openForm(p);
            break;
        case 'delete':
            if (!confirm(`למחוק את "${p.location_name}" ואת כל התמונות שלה?`)) return;
            try {
                await store.deletePoint(p);
                closeSheet('detailSheet');
                await loadPoints();
                toast('הנקודה נמחקה');
            } catch (err) { toast(err.message, 'err'); }
            break;
    }
});

// ---- Lightbox ----
function openLightbox(list, i) {
    lbList = list; lbIdx = i;
    showLb();
    $('lightbox').hidden = false;
}
function showLb() {
    $('lbImg').src = lbList[lbIdx];
    $('lbCount').textContent = lbList.length > 1 ? `${lbIdx + 1} / ${lbList.length}` : '';
    document.querySelectorAll('.lb-nav').forEach(b => { b.hidden = lbList.length < 2; });
}
const lbStep = d => { lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); };
$('lightbox').addEventListener('click', e => {
    if (e.target.closest('.lb-prev')) return lbStep(-1);
    if (e.target.closest('.lb-next')) return lbStep(1);
    $('lightbox').hidden = true;
});
let lbX = null;
$('lightbox').addEventListener('touchstart', e => { lbX = e.touches[0].clientX; }, { passive: true });
$('lightbox').addEventListener('touchend', e => {
    if (lbX == null) return;
    const dx = e.changedTouches[0].clientX - lbX;
    if (Math.abs(dx) > 50 && lbList.length > 1) { e.preventDefault(); lbStep(dx > 0 ? 1 : -1); }
    lbX = null;
});
document.addEventListener('keydown', e => {
    if ($('lightbox').hidden) return;
    if (e.key === 'Escape') $('lightbox').hidden = true;
    if (e.key === 'ArrowLeft') lbStep(1);
    if (e.key === 'ArrowRight') lbStep(-1);
});

// ============================================================================
// List + export
// ============================================================================
function filteredPoints() {
    const q = $('listSearch').value.trim().toLowerCase();
    const u = store.getUser();
    return points.filter(p => {
        if ($('listMine').checked && (!u || p.user_id !== u.id)) return false;
        if (!q) return true;
        return [p.location_name, p.reporter_name, p.notes, ...EXTRA_FIELDS.map(f => p[f.key])].some(s => (s || '').toLowerCase().includes(q));
    });
}
function renderList() {
    const list = filteredPoints();
    $('listCount').textContent = `(${list.length})`;
    $('pointList').innerHTML = list.length ? list.map(p => `
        <li data-id="${p.id}">
            ${p.photos.length ? `<img src="${esc(p.photos[0])}" alt="" loading="lazy">` : '<div class="noimg">📍</div>'}
            <div class="li-body">
                <div class="li-title">${esc(p.location_name)}</div>
                <div class="li-meta">${esc(p.reporter_name)} · ${esc(fmtDate(p.created_at))}${p.photos.length ? ' · 📷 ' + p.photos.length : ''}</div>
                ${(p.site_type || p.project_status) ? `<div class="li-tags">${[p.site_type, p.project_status].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
                ${p.notes ? `<div class="li-notes">${esc(p.notes)}</div>` : ''}
            </div>
        </li>`).join('') : '<li class="empty">לא נמצאו נקודות</li>';
}
function openList() { renderList(); openSheet('listSheet'); }
$('listBtn').addEventListener('click', () => { $('listMine').checked = false; openList(); });
$('listSearch').addEventListener('input', renderList);
$('listMine').addEventListener('change', () => {
    if ($('listMine').checked && !store.getUser()) { $('listMine').checked = false; return requireLogin(openList, 'יש להתחבר כדי לסנן את הנקודות שלך'); }
    renderList();
});
$('pointList').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const p = points.find(x => x.id === li.dataset.id);
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 16), { animate: false });
    openDetail(p.id);
});

function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const publicPhotos = p => p.photos.filter(u => /^https?:/.test(u));
function exportGeojson() {
    if (!isAdmin()) return toast('הורדת נתונים זמינה למנהל המערכת בלבד', 'err');
    const fc = {
        type: 'FeatureCollection',
        features: filteredPoints().map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
                id: p.id, location_name: p.location_name, reporter_name: p.reporter_name, notes: p.notes,
                ...Object.fromEntries(EXTRA_FIELDS.map(f => [f.key, p[f.key] || ''])),
                accuracy_m: p.accuracy_m, created_at: p.created_at, updated_at: p.updated_at, photos: publicPhotos(p)
            }
        }))
    };
    download(`field-points-${stamp()}.geojson`, JSON.stringify(fc, null, 2), 'application/geo+json');
}
$('exportGeojson').addEventListener('click', exportGeojson);
function exportCsv() {
    if (!isAdmin()) return toast('הורדת נתונים זמינה למנהל המערכת בלבד', 'err');
    const list = filteredPoints();
    if (!list.length) return toast('אין נקודות לייצוא', 'err');
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const maxPh = Math.max(0, ...list.map(p => publicPhotos(p).length));
    const appLink = id => location.origin + location.pathname + '?p=' + id;
    const head = ['מזהה', 'שם המיקום', 'שם המזין', ...EXTRA_FIELDS.map(f => f.label), 'הערות', 'קו רוחב (lat)', 'קו אורך (lng)', 'דיוק GPS (מ\')',
        'תאריך הזנה', 'תאריך עדכון', 'מספר תמונות', 'קישור למפה', 'קישור ביישום']
        .concat(Array.from({ length: maxPh }, (_, i) => 'תמונה ' + (i + 1)));
    const rows = list.map(p => {
        const ph = publicPhotos(p);
        return [p.id, p.location_name, p.reporter_name, ...EXTRA_FIELDS.map(f => p[f.key] || ''), p.notes, p.lat.toFixed(6), p.lng.toFixed(6), p.accuracy_m,
            fmtDate(p.created_at), p.updated_at ? fmtDate(p.updated_at) : '', p.photo_paths.length,
            `https://www.google.com/maps?q=${p.lat},${p.lng}`, appLink(p.id)]
            .concat(Array.from({ length: maxPh }, (_, i) => ph[i] || ''));
    });
    // BOM — כדי שאקסל יציג עברית כראוי
    download(`field-points-${stamp()}.csv`, '﻿' + [head].concat(rows).map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    if (store.mode === 'demo' && list.some(p => p.photo_paths.length))
        toast('במצב הדגמה התמונות שמורות במכשיר בלבד — אין להן קישור', 'err');
    else toast(`יוצאו ${list.length} נקודות ✓`, 'ok');
}
$('exportCsv').addEventListener('click', exportCsv);
// כפתורי מנהל בפרופיל — מורידים את כל הנקודות (ללא סינון הרשימה)
const allPoints = fn => () => { $('listSearch').value = ''; $('listMine').checked = false; fn(); };
$('csvBtn').addEventListener('click', allPoints(exportCsv));
$('geojsonAllBtn').addEventListener('click', allPoints(exportGeojson));
$('contactBtn').href = 'tel:' + CONTACT_PHONE;

// ============================================================================
// Search (GovMap: יישוב · שכונה · רחוב · כתובת · נקודת עניין · צומת)
// ============================================================================
const TYPE = Object.fromEntries(SEARCH_TYPES.map(t => [t.key, t]));
let searchTimer = null, searchSeq = 0, searchResults = [], searchMarker = null;
$('searchChips').innerHTML = SEARCH_TYPES.map(t => `<span>${ms(t.icon)} ${esc(t.label)}</span>`).join('');
$('searchBtn').addEventListener('click', () => {
    openSheet('searchSheet');
    setTimeout(() => $('searchInput').focus(), 350);
});
async function runSearch() {
    const q = $('searchInput').value.trim();
    const seq = ++searchSeq;
    if (q.length < 2) { $('searchResults').innerHTML = ''; $('searchMsg').textContent = ''; return; }
    $('searchMsg').textContent = 'מחפש…';
    const res = await searchPlaces(q);
    if (seq !== searchSeq) return;                       // תוצאה ישנה — התעלם
    searchResults = res;
    $('searchMsg').textContent = res.length ? `מקור: ${res[0].source}` : 'לא נמצאו תוצאות';
    $('searchResults').innerHTML = res.map((r, i) => {
        const t = TYPE[r.type] || TYPE.poi;
        return `<li data-i="${i}" role="option">
            <span class="sr-ic">${ms(t.icon)}</span>
            <span class="sr-body"><b>${esc(r.label)}</b><small>${esc(t.label)}</small></span>
            <button class="btn btn-xs btn-ghost sr-drop" data-drop="${i}" title="דקירת נקודה כאן">${ms('add_location_alt')}</button>
        </li>`;
    }).join('');
}
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 350); });
$('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); runSearch().then(() => { if (searchResults[0]) goToResult(searchResults[0]); }); }
});
function goToResult(r, drop) {
    closeSheet('searchSheet');
    const z = r.type === 'settlement' ? 14 : r.type === 'neighborhood' || r.type === 'street' ? 16 : 17;
    const ll = L.latLng(r.lat, r.lng);
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker(ll, { interactive: false, zIndexOffset: 900, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="search-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
    map.setView(ll, z, { animate: false });
    if (isGovmapActive()) gmMark(ll, z);
    if (drop) {
        const go = () => { clearDraft(); setDraft(ll, null); };
        if (requireLogin(go)) go();
    } else toast(r.label, 'ok');
}
$('searchResults').addEventListener('click', e => {
    const d = e.target.closest('[data-drop]');
    if (d) return goToResult(searchResults[+d.dataset.drop], true);
    const li = e.target.closest('li[data-i]');
    if (li) goToResult(searchResults[+li.dataset.i]);
});

// ============================================================================
// Init
// ============================================================================
// ---- מיתוג + מסך פתיחה ----
function initBrand() {
    const img = new Image();
    img.onload = () => {
        [['brandLogo', 'brandMark'], ['splashLogo', 'splashMark']].forEach(([i, m]) => {
            $(i).src = BRAND.LOGO_URL; $(i).hidden = false; $(m).hidden = true;
        });
        document.body.classList.add('has-logo');
    };
    img.src = BRAND.LOGO_URL;
    const skip = new URLSearchParams(location.search).has('p') || sessionStorage.getItem('fc_splash_seen');
    const hide = () => {
        $('splash').classList.add('gone');
        try { sessionStorage.setItem('fc_splash_seen', '1'); } catch (_) { }
        setTimeout(() => map.invalidateSize(), 50);
    };
    if (skip) { $('splash').hidden = true; return; }
    $('splashGo').addEventListener('click', () => { buzz(10); hide(); });
}
initBrand();

async function init() {
    store = await createStore();
    if (store.mode === 'demo') {
        const b = $('modeBanner');
        b.hidden = false;
        b.innerHTML = `⚠️ <b>מצב הדגמה</b> — הנתונים נשמרים במכשיר זה בלבד. <span class="muted">(${esc(store.reason)})</span>`;
        b.addEventListener('click', () => { b.hidden = true; });
    }
    store.onAuth(onAuthChanged);
    onAuthChanged();
    store.subscribe(() => { clearTimeout(init._t); init._t = setTimeout(loadPoints, 400); });
    await loadPoints();
    store.listOptions().then(o => { managedOptions = o || []; }).catch(() => { });

    if (points.length && !new URLSearchParams(location.search).get('p')) {
        map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])).pad(0.2), { maxZoom: 15 });
    }
    const pid = new URLSearchParams(location.search).get('p');
    if (pid && points.some(p => p.id === pid)) {
        const p = points.find(x => x.id === pid);
        map.setView([p.lat, p.lng], 16, { animate: false });
        openDetail(pid);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPoints(); });
}
init().catch(e => { console.error(e); toast('שגיאה בטעינת היישום: ' + e.message, 'err'); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { }));
}
