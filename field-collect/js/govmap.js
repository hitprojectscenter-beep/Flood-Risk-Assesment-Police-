// GovMap (המרכז למיפוי ישראל) — מפת רקע רשמית: צילום אוויר / רחובות ומבנים.
// GovMap מצייר את המפה ברכיב משלו (לא אריחים), ולכן הוא מוצג מעל Leaflet ומסונכרן איתו:
// Leaflet נשאר "מקור האמת" למיקום/זום; לחיצות במפת GovMap מתורגמות מ-ITM (EPSG:2039) ל-WGS84.
// תיעוד: https://api.govmap.gov.il/docs/intro/javascript-functions
import { GOVMAP } from './config.js';

const PROJ4_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.7.5/proj4.js';
const ITM = '+proj=tmerc +lat_0=31.7343936111111 +lon_0=35.2045169444444 +k=1.0000067 +x_0=219529.584 +y_0=626907.39 ' +
    '+ellps=GRS80 +towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs';
// זום Leaflet ↔ רמת GovMap (רמה 0 ≈ כל הארץ)
const LEVEL_OFFSET = 8;
const toLevel = z => Math.max(0, Math.min(13, Math.round(z - LEVEL_OFFSET)));
const toZoom = lvl => lvl + LEVEL_OFFSET;

let gm = null;              // window.govmap לאחר טעינה
let created = false;
let active = false;
let currentBg = null;
let handlers = {};          // { onClick(latlng), onPoint(id), onExtent(latlng, zoom) }
let suppressUntil = 0;      // התעלמות מאירועי תזוזה שנגרמו מסנכרון יזום

export const govmapAllowed = () => !!GOVMAP.token && GOVMAP.domains.includes(location.hostname);
export const isGovmapActive = () => active;

// בודק שהגלובל הוא באמת הספרייה (ולא אלמנט DOM עם id זהה — "named access" של הדפדפן)
const isLib = (o, key) => !!o && !(o instanceof Element) && typeof o[key] === 'function';
const LIB_KEY = { govmap: 'createMap', proj4: 'defs' };
function loadScript(src, globalName) {
    if (isLib(window[globalName], LIB_KEY[globalName])) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => isLib(window[globalName], LIB_KEY[globalName]) ? resolve(window[globalName]) : reject(new Error(globalName + ' לא נטען'));
        s.onerror = () => reject(new Error('טעינת ' + globalName + ' נכשלה'));
        document.head.appendChild(s);
    });
}

export const toITM = (lat, lng) => { const [x, y] = window.proj4('WGS84', ITM, [lng, lat]); return { x, y }; };
export const fromITM = (x, y) => { const [lng, lat] = window.proj4(ITM, 'WGS84', [x, y]); return { lat, lng }; };

const pointType = () => (gm.geometryType && gm.geometryType.POINT) || (gm.drawType && gm.drawType.Point);
const abs = rel => new URL(rel, location.href).href;

// מציג את GovMap במקום Leaflet, ממורכז לפי center/zoom של Leaflet
export async function showGovmap({ background, center, zoom }, h) {
    handlers = h || handlers;
    await loadScript(PROJ4_SRC, 'proj4');
    gm = await loadScript(GOVMAP.script, 'govmap');
    document.body.classList.add('gm-on');
    $box().hidden = false;
    const c = toITM(center.lat, center.lng);
    if (!created) {
        await Promise.resolve(gm.createMap('govmapCanvas', {
            token: GOVMAP.token,
            layers: [], visibleLayers: [],
            showXY: false, identifyOnClick: false, isEmbeddedToggle: false,
            background: background, layersMode: 1, zoomButtons: true,
            center: { x: c.x, y: c.y }, level: toLevel(zoom)
        }));
        created = true;
        gm.onEvent(gm.events.CLICK).progress(e => {
            const p = e && e.mapPoint;
            if (p && handlers.onClick) handlers.onClick(fromITM(p.x, p.y));
        });
        gm.onEvent(gm.events.EXTENT_CHANGE).progress(e => {
            if (!e || !e.extent) return;
            if (Date.now() < suppressUntil) return;
            const x = (e.extent.xmin + e.extent.xmax) / 2, y = (e.extent.ymin + e.extent.ymax) / 2;
            const lvl = e.lod && typeof e.lod.level === 'number' ? e.lod.level : null;
            if (handlers.onExtent) handlers.onExtent(fromITM(x, y), lvl == null ? null : toZoom(lvl));
        });
        active = true;
    } else {
        active = true;
        if (currentBg !== background) gm.setBackground(background);
        moveTo(center, zoom);
    }
    currentBg = background;
}

export function hideGovmap() {
    active = false;
    document.body.classList.remove('gm-on');
    $box().hidden = true;
}

// סנכרון מ-Leaflet ל-GovMap
export function moveTo(center, zoom) {
    if (!active) return;
    const c = toITM(center.lat, center.lng);
    suppressUntil = Date.now() + 900;
    gm.zoomToXY({ x: c.x, y: c.y, level: toLevel(zoom), marker: false });
}

// ציור הנקודות (ונקודת טיוטה) על מפת GovMap
export function drawPoints(points, { mineId, draft } = {}) {
    if (!active) return;
    const pts = points.map(p => ({ ...toITM(p.lat, p.lng), id: p.id, name: p.location_name, mine: p.user_id === mineId }));
    if (draft) pts.push({ ...toITM(draft.lat, draft.lng), id: '__draft__', name: 'נקודה חדשה', draft: true });
    const sym = p => ({ url: abs(p.draft ? 'assets/pin-draft.png' : p.mine ? 'assets/pin-mine.png' : 'assets/pin.png'), width: 30, height: 39 });
    const req = gm.displayGeometries({
        wkts: pts.map(p => `POINT(${p.x.toFixed(2)} ${p.y.toFixed(2)})`),
        names: pts.map(p => p.id),
        geometryType: pointType(),
        defaultSymbol: sym({}),
        symbols: pts.map(sym),
        clearExisting: true,
        data: { tooltips: pts.map(p => p.name) }
    });
    if (req && typeof req.progress === 'function') {
        req.progress(e => {
            const id = e && ((e.data && e.data.name) || e.name);
            if (id && id !== '__draft__' && handlers.onPoint) handlers.onPoint(id);
        });
    }
}

function $box() { return document.getElementById('govmapBox'); }
