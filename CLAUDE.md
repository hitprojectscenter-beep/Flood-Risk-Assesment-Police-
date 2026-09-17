# TSRS — Tsunami Station Risk Score Application

## Project Overview
GIS-based web application for assessing tsunami risk per police station territory along the Israeli Mediterranean coastline. Developed for the Israel Police as a decision-support tool for emergency resource allocation.

## Architecture
**Standalone web application** — static frontend (HTML/JS/Leaflet.js) + Python FastAPI backend + Firebase Realtime Database.

- **Frontend**: HTML5, CSS3, Vanilla JS, Leaflet.js 1.9, osmtogeojson
- **Backend**: Python FastAPI (optional — app works fully static from JSON files)
- **Database**: Firebase Realtime Database (optional — fallback to local JSON)
- **Map**: ESRI Hillshade + OSM (default), CartoDB, ESRI Satellite, OpenTopoMap, GOVMAP WMS
- **Data Sources**: CBS demographic CSVs, OSM Overpass API (city boundaries, roads, buildings)
- **Deployment**: Vercel (static) — `vercel.json` configured

## TSRS Formula (Israel-Calibrated 2026)
```
TSRS = H × 0.25 + V × 0.30 + O × 0.15 + R⁻¹ × 0.18 + I⁻¹ × 0.12
```

| Component | Hebrew | 3-Word Description | Weight (IL) | Original |
|-----------|--------|-------------------|-------------|----------|
| H (Hazard) | סיכון הצפה | חשיפה לגלי צונאמי | **25%** | 35% |
| V (Vulnerability) | פגיעות | פגיעות דמוגרפית | **30%** | 30% |
| O (Operational) | צוואר בקבוק | קושי בפינוי | **15%** | 20% |
| R (Response) | תגובה | משאבי תגובה | **18%** | 10% |
| I (Infrastructure) | תשתיות | מבנים ומקלטים | **12%** | 5% |

**Calibration rationale:** Israel has narrow coastline (uniform exposure → H ↓),
huge resource gaps between central/peripheral stations (R ↑), limited shelters
in periphery (I ↑). Weights are user-adjustable via interactive sliders.

### Score Interpretation
| Score | Hebrew | English |
|-------|--------|---------|
| 0-20 | מצוין | Excellent readiness |
| 20-40 | טוב | Good readiness |
| 40-60 | מספק | Satisfactory, needs monitoring |
| 60-80 | דורש שיפור | Needs significant improvement |
| 80-100 | קריטי | Critical — immediate response |

## Conversation Summary

### Session 1 — 2026-04-03
- Read BRD + TDD specification documents (Hebrew .docx)
- Read CBS demographic CSVs (age breakdown, socioeconomic profiles)
- Analyzed QGIS2WEB export (7 OSM layers for Jerusalem area)
- Researched GOVMAP API (WMS endpoint, no token needed for open layers)
- Chose: standalone app (not Streamlit), GOVMAP WMS + OSM, Firebase
- Built complete app: 25 files, FastAPI backend, Leaflet frontend, RTL Hebrew UI
- Verified: map loads, stations colored by TSRS, popups with score breakdown, operational panel

### Session 1 — Continued
- Fixed Firebase placeholder detection (skip when no real config)
- Fixed production data loading for Vercel (skip API, use local JSON)
- Created vercel.json for static deployment
- Added OSM overlay layers (roads + buildings) via Overpass API with zoom-dependent enable/disable
- Fixed z-ordering with custom Leaflet panes

### Session 1 — Major Redesign
User feedback triggered 8+ improvements:
1. **TSRS explanations**: Added 3-word descriptions per category + verbal overall score
2. **Inundation fix**: Fixed direction (now always inland), added Haifa bay detail, max depth explanation
3. **Real city boundaries**: Overpass API bulk query — **554 real municipal polygons** (all Israeli municipalities)
4. **Hillshade**: ESRI World Hillshade (free, no token) as overlay + default base
5. **Modern design**: Dark glassmorphism theme (Rubik font, teal accent, frosted glass sidebar)
6. **Police station icons**: Israel Police shield SVG at zoom 15+
7. **Building symbology**: Red (below flood) / Green (above flood) / Blue (shelter potential)
8. **Geographic profiling**: Age distribution bar chart, socioeconomic cluster, income, car ownership

### Session 1 — Bug Fixes
Fixed 5 critical bugs:
1. Init order: TSRSOverlays.init() before TSRSControls.init() (prevented roads/buildings loading)
2. Syntax error in osm-overlays.js (extra brace in onEachFeature)
3. Demographic profiling: use stored lastClickedProps instead of re-searching layer
4. Popup close handler: sidebar summary + operational panel auto-close
5. Data loading: cities.json loaded first, before API fallback

### Session 1 — Heatmap Visualization
Replaced static polygon inundation layer with dynamic heatmap (Leaflet.heat):
- Gradient: blue → green → yellow → orange → red (depth intensity)
- Radius scales with wave height (18px at 2m → 35px at 7m+)
- Points generated from polygon edges, centroids, and interior grid
- Inland gradient factor (intensity decreases further from coast)
- Dashed blue polygon outlines remain as context layer
- Legend updated with gradient bar

### Session 2 — Multilingual + CBS Data
- Added i18n.js with 5 languages: Hebrew (RTL), English, Russian, French, Spanish
- ~80 translation keys per language for full UI coverage
- Language selector in header, persists to localStorage
- LTR CSS overrides for non-Hebrew languages
- Real CBS socioeconomic data: 202 cities with cluster (1-10) from CBS 2022
- Cities filtered to only show those with CBS data
- backend/extract_socioeconomic.py: parses CBS CSV (Windows-1255)

### Session 2 — Layer Refactor
- Removed inaccurate coastline layer
- Renamed "תחנות משטרה" to "ערים" (cities layer = municipal boundaries)
- Added real police stations from OSM (amenity=police) at zoom 12+
- Israel Police shield SVG icon
- Buildings symbology by flood depth: red/green/blue (submerged/safe/shelter)

### Session 2 — Responsive Design
- 5 breakpoints: 1023px, 767px, 600px, 480px, 360px
- Mobile sidebar: collapsible overlay with hamburger toggle
- Touch-friendly: 22px slider thumbs, 18px checkboxes
- Info modal: 95vw on mobile, single-column metric grid
- Operational panel: responsive grid (1/2/3 columns)
- LTR direction overrides for non-Hebrew languages

### Session 2 — Info Modal + Presentation
- Auto-opens on app load with TSRS explanation
- 6 sections: Problem, Formula, 5 Metrics, Application, Risk Tiers, Sources
- "ℹ️ הסבר" button in header to reopen
- Created 8-slide presentation (TSRS_Presentation_Improved.pptx)
- Presenter guide Word document (TSRS_Presenter_Guide.docx)

### Session 3 — Israel Weight Calibration
Major calibration of TSRS weights for Israel 2026 conditions:
- H reduced (35→25%): narrow Mediterranean coast, uniform exposure
- V unchanged (30%): demographic vulnerability is critical differentiator
- O reduced (20→15%): partly moved to Infrastructure
- R increased (10→18%): huge resource gaps between central/peripheral stations
- I increased (5→12%): vertical shelters critical in peripheral towns
- NEW: frontend/js/weights.js — centralized weight config module
- NEW: Interactive weight sliders in sidebar (5 sliders + 2 presets)
- Real-time TSRS recalculation on the map when weights change
- Auto-normalization to ensure weights sum to 100%

### Session 3 — Documentation Sync + Spec Updates
- Header CSS bug fix: .header-left missing flex layout
- Improved mobile responsive for weight sliders
- New presentation slide on weight calibration (slide 4)
- Created 4 spec update docs (BRD/TDD × HE/EN):
  - files_2/BRD_Updates_Hebrew.docx
  - files_2/BRD_Updates_English.docx
  - files_2/TDD_Updates_Hebrew.docx
  - files_2/TDD_Updates_English.docx
- Full sync of CLAUDE.md and Memory.md with current state

### Session 4 — 2026-09-09 — Health Check + Bug Fixes
Full integrity check (syntax, JSON, live browser run, backend smoke test), then fixes:
1. **CRITICAL — heatmap init crash**: leaflet.heat canvas created while map container
   had zero width → IndexSizeError on every map move, init aborted, map stuck at wrong
   zoom. Fixed: `_addHeatmapSafely()` in inundation.js (size guard + deferred add on
   resize), `map.invalidateSize()` + separated try/catch blocks in app.js.
2. **Overpass rate limiting**: 3 concurrent queries → 504. Fixed: requests serialized
   via promise chain in osm-overlays.js; on total failure a temporary "⚠ load error"
   hint is shown next to the layer label (new i18n key `layer_load_error`).
3. **Missing coastal cities**: Tel Aviv-Yafo was absent from cities.json entirely;
   Herzliya + Nahariya were filtered out by CBS spelling mismatches (הרצלייה/נהרייה).
   Fixed: `_normalizeCityName()` matching in tsrs.js (213 cities now pass, was 190);
   backend/add_missing_cities.py fetches Tel Aviv-Yafo boundary (OSM name:en is
   "Tel-Aviv") with real population 474,530 → cities.json now 238 features.
4. **i18n**: added `layer_buildings_3d` key (5 languages) — 3D buildings label now translates.
5. **Building tooltips**: OSM `building=yes` no longer shown as literal name "yes".
Generated 6 app screenshots → `../Claude outputs/screenshots/`.

### Session 5 — 2026-09-17 — Buildings/3D Reliability (Local Tiles)
User report: buildings + 3D layers (and shelter analysis) fail to load. Root cause:
ALL Overpass endpoints unreliable from this machine (overpass-api.de → 406/504,
kumi.systems hangs without responding). Fixes:
1. **Local building tiles** (the big one): backend/generate_building_tiles.py extracts
   115,265 buildings in the Mediterranean coastal band (lat 31.55–33.12, coast+4km)
   from ../../OSM/gis_osm_buildings_a_free_1.shp into 229 GeoJSON tiles (0.02° grid,
   31.4 MB) at frontend/data/buildings_tiles/ + index.json. Real building:levels for
   16,016 buildings fetched once from Overpass by osm_id and baked in (cached at
   backend/data/building_levels_cache.json). Frontend loads local tiles FIRST
   (instant, offline-capable); Overpass only outside tile coverage.
2. **Overpass chain hardened**: maps.mail.ru mirror added first (works + CORS),
   private.coffee added last; 20s per-endpoint timeout so a hung mirror can't stall.
3. **Wave-height reactivity**: building flood classification (red/green/blue shelter)
   now re-styles when the wave slider moves (TSRSOverlays.refreshForWaveChange(),
   debounced in controls.js) — previously computed only at layer load.
4. **Dead CDN removed**: cdn.osmbuildings.org script tag deleted (was 404; the
   isometric pseudo-3D renderer in osm-overlays.js is the actual renderer).
5. **Cache busting**: ?v=20260917 on all local JS/CSS includes — stale-cache issues
   repeatedly masked fixes. Bump the version when editing frontend JS/CSS.
Verified: 3D loads 10,343 features instantly in Tel Aviv; at 8m wave 146 buildings
turn red; Sheraton hotel (23 floors, real OSM levels) classified as shelter.

### Session 6 — 2026-09-17 — Wave-Height Coordination + Canvas Rendering
User report: no coordination between wave height and building colors; layers slow.
1. **Classification vs wave height directly** (user-specified semantics):
   red = building height (levels×3m) BELOW wave height; green = above;
   blue = above AND 4+ floors (vertical shelter). The old ×0.7 depth factor
   removed. Tooltips show "גובה גל: X מ'"; legend texts updated in 5 languages.
2. **Instant recolor on wave change**: setStyle-in-place via a 3D parts
   registry (_buildings3DParts) + _recolorBuildings2D/3D — 1-4 ms instead of
   a full geometry rebuild. controls.js slider hook unchanged (debounced 400ms).
3. **Leaflet rendering optimizations**: L.canvas renderers for both building
   layers (dedicated buildings3DPane, zIndex 446); wall quads merged into two
   MultiPolygons per building (lit/shadow) → 4 canvas paths per building
   instead of one per edge; base/walls non-interactive (roof only); tile
   content cropped to viewport+20% before path construction (~2,990 features
   built instead of 10,343 in the Tel Aviv test view).
Cache version bumped to ?v=20260917b.

### Session 7 — 2026-09-17 — City Querying Fix (Canvas Click-Swallowing)
User report: cities layer stopped responding to clicks after toggling buildings.
Root cause: the building canvas renderers (and the leaflet.heat canvas) are DOM
elements covering the whole map above the SVG city polygons — they swallow the
clicks; the empty canvases even persisted after the layers were turned off,
leaving querying dead at every zoom. Fixes:
1. tsrs.js: map-level click fallback — when a click's DOM target is a CANVAS,
   the cities layer is hit-tested manually (ray-casting point-in-polygon,
   Polygon+MultiPolygon+holes) and the matched city's click handler is fired.
2. osm-overlays.js: _removeRendererIfIdle() detaches a canvas renderer from
   the map whenever its building layer is removed (toggle off / zoom-out);
   Leaflet re-attaches it automatically on next use.
Verified: city popup opens with buildings+3D active (click through canvas),
after toggling off only the heat canvas remains and native SVG clicks work,
re-enabling re-adds canvases with recolor + fallback intact.
Cache version: ?v=20260917c.

## Project Structure
```
tsrs-app/
├── frontend/
│   ├── index.html              # Main RTL Hebrew UI (dark theme)
│   ├── css/style.css           # Glassmorphism dark design
│   ├── js/
│   │   ├── app.js              # Main controller
│   │   ├── map.js              # Leaflet + Hillshade + GOVMAP
│   │   ├── tsrs.js             # Station viz, popups with explanations
│   │   ├── controls.js         # District selector, wave slider, toggles
│   │   ├── inundation.js       # Flood zone layer
│   │   ├── osm-overlays.js     # OSM roads/buildings via Overpass API
│   │   ├── operational.js      # Operational guidelines panel
│   │   └── firebase-config.js  # Firebase integration
│   └── data/                   # Pre-generated JSON
│       ├── cities.json         # 554 real municipal boundaries from OSM
│       ├── stations.json       # Sample station polygons (fallback)
│       ├── coastline.json      # Mediterranean coastline
│       └── inundation.json     # All wave heights 0.5-10m
├── backend/
│   ├── main.py                 # FastAPI server
│   ├── models/tsrs_model.py    # TSRS calculation engine
│   ├── data/geo_utils.py       # GeoJSON generators
│   ├── data/load_csv.py        # CBS data loader
│   ├── generate_cities.py      # OSM city boundary fetcher
│   └── populate_firebase.py    # Firebase data population
├── vercel.json                 # Vercel static deployment config
├── CLAUDE.md                   # This file
└── Memory.md                   # Development log
```

## Running

### Static (no backend):
Open `frontend/index.html` in browser. Data loads from `data/*.json`.

### With FastAPI:
```bash
cd backend && pip install -r requirements.txt
python -m uvicorn main:app --port 5380
```

### Vercel:
Push to GitHub, import in Vercel. Root: `tsrs-app`, Output: `frontend`.

## Key Decisions
| Decision | Choice | Reason |
|----------|--------|--------|
| Map engine | Leaflet.js | BRD/TDD spec, lightweight, extensible |
| Base map | OSM + ESRI Hillshade | Free, no token, terrain context |
| City boundaries | OSM Overpass API | Real municipal data, free |
| Design | Dark glassmorphism | Modern, professional, high contrast for GIS |
| Data loading | Firebase → API → JSON | Triple fallback, works everywhere |
| Hebrew RTL | Full RTL | BRD requirement, sidebar right |
