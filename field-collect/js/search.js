// חיפוש במפה — יישוב, שכונה, רחוב, כתובת, נקודת עניין, צומת.
// סדר מקורות: (1) GovMap API עם מפתח היישום (שכבות החיפוש שהוגדרו לו בפורטל GovMap),
// (2) שירות החיפוש של GovMap (TldSearch), (3) OpenStreetMap Nominatim — כגיבוי בכל מקום.
import { SEARCH_TYPES } from './config.js';
import { govmapAllowed, loadGovmapLib, loadProj4, fromITM } from './govmap.js';

const TLD_URL = 'https://es.govmap.gov.il/TldSearch/api/DetailsByQuery?gid=govmap&lyrs=276267023&query=';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il&accept-language=he&limit=8&q=';

// מפתחות התוצאה של GovMap → סוג פנימי
const GM_KEY_TYPE = {
    SETTLEMENT: 'settlement', NEIGHBORHOOD: 'neighborhood', STREET: 'street', ADDRESS: 'address',
    POI_MID_POINT: 'poi', POI: 'poi', JUNCTION: 'junction', JUNCTIONS: 'junction', INTERSECTION: 'junction'
};
const ORDER = SEARCH_TYPES.map(t => t.key);

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

// X,Y של GovMap: ITM (מאות אלפים) או Web Mercator (מיליונים)
function gmXY(x, y) {
    x = +x; y = +y;
    if (!isFinite(x) || !isFinite(y)) return null;
    if (Math.abs(x) > 1e6) {
        const lng = x / 6378137 * 180 / Math.PI;
        const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI;
        return { lat, lng };
    }
    return fromITM(x, y);
}
const guessType = label => {
    if (/צומת|מחלף/.test(label)) return 'junction';
    if (/\d/.test(label)) return 'address';
    return 'poi';
};

async function viaGovmapApi(q) {
    const gm = await loadGovmapLib();
    if (typeof gm.geocode !== 'function') throw new Error('no geocode');
    const type = gm.geocodeType && (gm.geocodeType.FullResult !== undefined ? gm.geocodeType.FullResult : gm.geocodeType.AccuracyOnly);
    const res = await withTimeout(Promise.resolve(gm.geocode({ keyword: q, type })), 4500);
    if (!res || res.status !== 0 || !Array.isArray(res.data)) return [];
    return res.data.map(d => {
        const ll = gmXY(d.X, d.Y);
        const label = d.ResultLable || d.ResultLabel || q;
        const type = GM_KEY_TYPE[(d.ResultType || d.LayerName || '').toUpperCase()] || guessType(label);
        return ll && { label, type, ...ll, source: 'GovMap' };
    }).filter(Boolean);
}

async function viaTld(q) {
    const r = await withTimeout(fetch(TLD_URL + encodeURIComponent(q)), 6000);
    if (!r.ok) throw new Error('tld ' + r.status);
    const j = await r.json();
    const out = [];
    Object.entries((j && j.data) || {}).forEach(([key, items]) => {
        const type = GM_KEY_TYPE[key.toUpperCase()];
        if (!type || !Array.isArray(items)) return;          // רק סוגי החיפוש שנבחרו
        items.forEach(it => {
            const ll = gmXY(it.X, it.Y);
            if (ll) out.push({ label: it.ResultLable || it.ResultLabel || '', type, ...ll, source: 'GovMap' });
        });
    });
    return out;
}

async function viaNominatim(q) {
    const r = await withTimeout(fetch(NOMINATIM + encodeURIComponent(q)), 7000);
    if (!r.ok) throw new Error('nominatim ' + r.status);
    const j = await r.json();
    const map = { city: 'settlement', town: 'settlement', village: 'settlement', hamlet: 'settlement', suburb: 'neighborhood',
        neighbourhood: 'neighborhood', quarter: 'neighborhood', road: 'street', residential: 'street', street: 'street',
        house: 'address', building: 'address', junction: 'junction', motorway_junction: 'junction' };
    return j.map(it => ({
        label: it.display_name.split(',').slice(0, 3).join(','),
        type: map[it.addresstype] || map[it.type] || (it.category === 'highway' ? 'street' : 'poi'),
        lat: +it.lat, lng: +it.lon, source: 'OpenStreetMap'
    }));
}

export async function searchPlaces(q) {
    q = (q || '').trim();
    if (q.length < 2) return [];
    try { await loadProj4(); } catch (_) { }          // נדרש להמרת ITM של GovMap
    const sources = [...(govmapAllowed() ? [viaGovmapApi] : []), viaTld, viaNominatim];
    for (const src of sources) {
        try {
            const res = await src(q);
            if (res.length) {
                const seen = new Set();
                return res
                    .filter(r => { const k = r.type + '|' + r.label; if (seen.has(k)) return false; seen.add(k); return true; })
                    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
                    .slice(0, 12);
            }
        } catch (e) { console.warn('[search]', src.name, e.message); }
    }
    return [];
}
