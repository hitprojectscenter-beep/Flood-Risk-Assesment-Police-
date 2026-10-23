// Service Worker — יומן שטח
// קבצי היישום: network-first עם נפילה למטמון (טעינה גם בקליטה חלשה).
// אריחי מפה: cache-first (אזורים שנצפו זמינים גם ללא קליטה).
// בקשות ל-Supabase (נתונים/הרשמה/העלאות) לעולם אינן נשמרות במטמון.
const SHELL = 'fcollect-shell-v4';
const TILES = 'fcollect-tiles-v1';
const SHELL_FILES = [
  './', './index.html', './css/style.css?v=20261023e', './js/app.js?v=20261023d',
  './js/store.js', './js/photos.js', './js/config.js', './manifest.json', './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(SHELL_FILES.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = url => /(tile\.openstreetmap\.org|israelhiking\.osm\.org\.il\/.+Tiles|tile\.opentopomap\.org|server\.arcgisonline\.com|basemaps\.cartocdn\.com)/.test(url);
const isShell = url => url.startsWith(self.location.origin) || /unpkg\.com|esm\.sh|fonts\.(googleapis|gstatic)\.com/.test(url);

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (/supabase\.co/.test(url)) return;

  if (isTile(url)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
        return res;
      } catch (_) { return Response.error(); }
    }));
    return;
  }

  if (isShell(url)) {
    e.respondWith(fetch(e.request)
      .then(res => { if (res.ok) { const cp = res.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
  }
});
