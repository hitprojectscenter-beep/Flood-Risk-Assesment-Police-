// יומן שטח — בקר ראשי: מפה, דקירת נקודה, טופס הזנה, צפייה, רשימה, ייצוא.
import { createStore } from './store.js';
import { resizeImage } from './photos.js';
import { MAX_PHOTOS, MAP_CENTER, MAP_ZOOM } from './config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const fmtCoord = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

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
const SHEETS = ['authSheet', 'formSheet', 'detailSheet', 'listSheet', 'layersSheet'];
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
L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

const BASES = {
    street: {
        label: 'רחובות', icon: '🏙️',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        opt: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
    },
    hiking: {
        label: 'שבילים', icon: '🥾',
        url: 'https://israelhiking.osm.org.il/Hebrew/Tiles/{z}/{x}/{y}.png',
        opt: { maxZoom: 19, maxNativeZoom: 16, attribution: '<a href="https://israelhiking.osm.org.il">Israel Hiking Map</a> · © OpenStreetMap' }
    },
    topo: {
        label: 'טופוגרפית', icon: '⛰️',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        opt: { maxZoom: 19, maxNativeZoom: 17, subdomains: 'abc', attribution: '<a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · © OpenStreetMap' }
    },
    satellite: {
        label: 'צילום אוויר', icon: '🛰️',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        opt: { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }
    },
    dark: {
        label: 'כהה', icon: '🌙',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        opt: { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO' }
    }
};
let baseLayer = null;
let baseKey = localStorage.getItem('fc_base') || 'street';
if (!BASES[baseKey]) baseKey = 'street';
function setBase(key) {
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(BASES[key].url, BASES[key].opt).addTo(map);
    baseLayer.bringToBack();
    baseKey = key;
    try { localStorage.setItem('fc_base', key); } catch (_) { }
    document.querySelectorAll('#baseLayers .layer-card').forEach(c => c.classList.toggle('active', c.dataset.key === key));
}
$('baseLayers').innerHTML = Object.entries(BASES).map(([k, b]) =>
    `<button class="layer-card" data-key="${k}"><span>${b.icon}</span>${b.label}</button>`).join('');
$('baseLayers').addEventListener('click', e => {
    const c = e.target.closest('.layer-card');
    if (c) setBase(c.dataset.key);
});
setBase(baseKey);

const hillshade = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, maxNativeZoom: 16, opacity: 0.45, attribution: '© Esri Hillshade' });
$('hillshadeChk').addEventListener('change', e => { e.target.checked ? hillshade.addTo(map) : map.removeLayer(hillshade); });
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
        meMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#3B82F6', fillOpacity: 1, interactive: false }).addTo(map);
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
        html: `<div class="pin ${mine ? 'mine' : ''} ${active ? 'active' : ''}"><span>${n ? '📷' : '📍'}</span>${n > 1 ? `<b>${n}</b>` : ''}</div>`,
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
    $('pointCount').textContent = points.length;
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
let authTab = 'login';
function setAuthTab(tab) {
    authTab = tab;
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.signup-only').forEach(el => { el.hidden = tab !== 'signup'; });
    $('authSubmit').textContent = tab === 'signup' ? 'הרשמה' : 'התחברות';
    $('authPass').autocomplete = tab === 'signup' ? 'new-password' : 'current-password';
    setMsg('authMsg', '');
}
document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => setAuthTab(t.dataset.tab)));

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
        $('profEmail').textContent = u.email;
        const mine = points.filter(p => p.user_id === u.id);
        const photos = mine.reduce((s, p) => s + p.photo_paths.length, 0);
        $('profStats').innerHTML = `<div><b>${mine.length}</b><span>נקודות</span></div><div><b>${photos}</b><span>תמונות</span></div>`;
    }
    openSheet('authSheet');
}
$('userBtn').addEventListener('click', () => openAuth());

$('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('authEmail').value.trim(), password = $('authPass').value, name = $('authName').value.trim();
    if (!email || !password) return setMsg('authMsg', 'יש למלא אימייל וסיסמה', false);
    if (authTab === 'signup' && !name) return setMsg('authMsg', 'יש למלא שם מלא', false);
    const btn = $('authSubmit');
    btn.disabled = true;
    setMsg('authMsg', 'מתבצע…', true);
    try {
        if (authTab === 'signup') {
            const r = await store.signUp({ email, password, name });
            if (r.needsConfirm) {
                setMsg('authMsg', 'נרשמת! נשלח אליך מייל אימות — אשר/י אותו ואז התחבר/י.', true);
                setAuthTab('login');
                setMsg('authMsg', 'נרשמת! נשלח אליך מייל אימות — אשר/י אותו ואז התחבר/י.', true);
                return;
            }
        } else {
            await store.signIn({ email, password });
        }
        $('authPass').value = '';
        closeSheet('authSheet');
        toast('ברוך/ה הבא/ה, ' + store.getUser().name, 'ok');
        if (pendingAfterLogin) { const f = pendingAfterLogin; pendingAfterLogin = null; f(); }
    } catch (err) {
        setMsg('authMsg', err.message, false);
    } finally {
        btn.disabled = false;
    }
});
$('logoutBtn').addEventListener('click', async () => {
    await store.signOut();
    closeSheet('authSheet');
    toast('התנתקת');
});
$('myPointsBtn').addEventListener('click', () => { $('listMine').checked = true; openList(); });

function onAuthChanged() {
    const u = store.getUser();
    $('userBtnLabel').textContent = u ? '👤 ' + u.name : 'כניסה';
    $('userBtn').classList.toggle('logged', !!u);
    renderMarkers();
    if (detailId && $('detailSheet').classList.contains('open')) renderDetail(detailId);
}

function requireLogin(action, note) {
    if (store.getUser()) return true;
    pendingAfterLogin = action;
    setAuthTab('login');
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
    draft = { lat: latlng.lat, lng: latlng.lng, accuracy_m: accuracy };
    if (!draftMarker) {
        draftMarker = L.marker(latlng, {
            draggable: true, zIndexOffset: 1000,
            icon: L.divIcon({ className: 'pin-wrap', html: '<div class="pin draft"><span>✚</span></div>', iconSize: [34, 42], iconAnchor: [17, 40] })
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
}
function clearDraft() {
    draft = null;
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
    if (editing && markers.has(editing.id)) markers.get(editing.id).setOpacity(1);
    editing = null;
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
    $('detailBody').innerHTML = `
        <h2 class="detail-title">${esc(p.location_name)}</h2>
        <div class="detail-meta">
            <span>👤 ${esc(p.reporter_name)}</span>
            <span>🕒 ${esc(fmtDate(p.created_at))}${edited ? ' · עודכן ' + esc(fmtDate(p.updated_at)) : ''}</span>
        </div>
        <div class="coords-row">
            <span class="coords" dir="ltr">${fmtCoord(p.lat, p.lng)}${p.accuracy_m ? ` (±${p.accuracy_m}m)` : ''}</span>
            <button class="btn btn-xs btn-ghost" data-act="copy">📋 העתקה</button>
        </div>
        ${p.notes ? `<div class="detail-notes">${esc(p.notes)}</div>` : '<div class="muted small">אין הערות</div>'}
        ${p.photos.length ? `<div class="detail-photos">${p.photos.map((url, i) =>
            `<button class="dphoto" data-i="${i}"><img src="${esc(url)}" alt="תמונה ${i + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
        <div class="detail-actions">
            <a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 ניווט</a>
            <a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes">Waze</a>
            <button class="btn btn-sm btn-ghost" data-act="share">🔗 שיתוף</button>
            ${mine ? `<button class="btn btn-sm btn-ghost" data-act="edit">✏️ עריכה</button>
                      <button class="btn btn-sm btn-danger" data-act="delete">🗑️ מחיקה</button>` : ''}
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
        return [p.location_name, p.reporter_name, p.notes].some(s => (s || '').toLowerCase().includes(q));
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
$('exportGeojson').addEventListener('click', () => {
    const fc = {
        type: 'FeatureCollection',
        features: filteredPoints().map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
                id: p.id, location_name: p.location_name, reporter_name: p.reporter_name, notes: p.notes,
                accuracy_m: p.accuracy_m, created_at: p.created_at, updated_at: p.updated_at, photos: publicPhotos(p)
            }
        }))
    };
    download(`field-points-${stamp()}.geojson`, JSON.stringify(fc, null, 2), 'application/geo+json');
});
$('exportCsv').addEventListener('click', () => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['id', 'location_name', 'reporter_name', 'notes', 'lat', 'lng', 'accuracy_m', 'created_at', 'photos']]
        .concat(filteredPoints().map(p => [p.id, p.location_name, p.reporter_name, p.notes, p.lat, p.lng, p.accuracy_m, p.created_at, publicPhotos(p).join(' ')]));
    // BOM — כדי שאקסל יציג עברית כראוי
    download(`field-points-${stamp()}.csv`, '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
});

// ============================================================================
// Init
// ============================================================================
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
