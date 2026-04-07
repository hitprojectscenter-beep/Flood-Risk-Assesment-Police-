# TSRS Application — Development Memory Log

## Session: 2026-04-03

### Phase 1: Requirements Analysis
- Read BRD (Hebrew .docx) — TSRS model for Israel Police tsunami preparedness
- Read TDD (Hebrew .docx) — React/Leaflet + FastAPI + PostGIS architecture
- Read CBS CSVs — 1,285 settlements (age, socioeconomic), Windows-1255 encoding
- Analyzed QGIS2WEB export — 7 OSM layers for Jerusalem area
- Researched GOVMAP API — WMS open endpoint, JavaScript SDK (needs token)

### Phase 2: Architecture Decisions
- Standalone application (not Streamlit)
- No GOVMAP token → open WMS + OSM
- Firebase Realtime Database + API + JSON fallback chain
- Leaflet.js as geographic engine

### Phase 3: Initial Implementation (25 files)
1. **Backend**: FastAPI with TSRS engine, CBS data loading, GeoJSON generators
2. **Frontend**: Leaflet map, GOVMAP WMS, district selector, wave slider
3. **TSRS Popups**: Score breakdown with 5-component bars (H, V, O, R, I)
4. **Operational Panel**: Dynamic guidelines per station + wave height
5. **Firebase**: Config + population script
6. **Verification**: Tested in Chrome — stations, inundation, popups all working

### Phase 4: Vercel Deployment
- Created `vercel.json` (static from frontend/)
- Fixed `getApiBase()` for production (skip API, use local JSON)
- Added `HAS_API` flag to skip API calls on Vercel
- Client-side operational data generation (no backend needed)

### Phase 5: OSM Overlay Layers
- Created `osm-overlays.js` — Overpass API integration for roads + buildings
- Zoom-dependent checkboxes: roads (13+), buildings (15+)
- Disabled state with Hebrew hint text
- Custom Leaflet panes for z-ordering (zIndex 445/450)
- Debounced loading, viewport caching, AbortController
- Tested: roads visible at zoom 16 in Tel Aviv area

### Phase 6: Major Redesign (8 Requirements)

**Req 1: TSRS Category Explanations**
- Added 3-word descriptions: H="חשיפה לגלי צונאמי", V="פגיעות דמוגרפית", etc.
- Score verbal badges: 0-20 "מצוין", 20-40 "טוב", 40-60 "מספק", 60-80 "דורש שיפור", 80-100 "קריטי"
- Overall verbal summary under TSRS total score

**Req 2: Fix Inundation Zones**
- Fixed normal vector: always offset INLAND (positive longitude)
- Added denser coastline points for Haifa bay accuracy
- Added `max_depth_desc` field with Hebrew severity explanation

**Req 3: Real Municipal Boundaries**
- Created `generate_cities.py` — fetches OSM admin boundaries via Overpass
- 19 coastal cities: Nahariya → Ashkelon + Eilat
- Ring merging algorithm for complex boundary relations
- TSRS scores generated from demographics

**Req 4: ESRI Hillshade**
- Added as default base (OSM + Hillshade blend)
- Also available as standalone overlay toggle
- Added satellite (ESRI), topographic (OpenTopoMap), Voyager (CartoDB) options

**Req 5: Modern Design**
- Dark glassmorphism theme (backdrop-filter blur)
- Rubik font (Hebrew-optimized)
- Color palette: #0F172A (deep navy), #14B8A6 (teal accent)
- Gradient header with accent glow
- Glass sidebar with card sections
- Dark popups and tooltips matching theme

**Req 6: Police Station Icons** (planned)
- At zoom 15+: Israel Police logo as L.icon markers
- Visible alongside building layer

**Req 7: Building Color by Flood Depth** (planned)
- Red: below max flood depth (submerged)
- Green: above max flood depth (safe)
- Blue: potential shelters (4+ levels, above flood)

**Req 8: Geographic Profiling** (planned, user follow-up)
- Population count on city click
- Age distribution bar chart (from CBS data)
- Socioeconomic cluster display
- Inundation zones refined from OSM coastline

## Files Created/Modified

### Initial Build (25 files)
| File | Purpose |
|------|---------|
| frontend/index.html | Main HTML (RTL Hebrew) |
| frontend/css/style.css | Dark glassmorphism CSS |
| frontend/js/app.js | Main controller |
| frontend/js/map.js | Leaflet + Hillshade + GOVMAP |
| frontend/js/tsrs.js | TSRS viz + explanations |
| frontend/js/controls.js | UI controls |
| frontend/js/inundation.js | Flood zone layer |
| frontend/js/osm-overlays.js | OSM roads/buildings (Overpass) |
| frontend/js/operational.js | Op guidelines panel |
| frontend/js/firebase-config.js | Firebase integration |
| frontend/data/*.json | Pre-generated GeoJSON |
| backend/main.py | FastAPI server |
| backend/models/tsrs_model.py | TSRS calculation engine |
| backend/data/geo_utils.py | GeoJSON generators |
| backend/data/load_csv.py | CBS data loader |
| backend/generate_cities.py | OSM city boundary fetcher |
| backend/populate_firebase.py | Firebase data population |
| vercel.json | Vercel deployment config |

### Phase 7: Bug Fixes (5 critical)
1. **Init order**: TSRSOverlays.init() BEFORE TSRSControls.init() — roads/buildings couldn't load
2. **Syntax error**: Extra closing brace in osm-overlays.js onEachFeature — broke entire module
3. **Demographic profiling**: Store lastClickedProps, use for showDemographicProfile
4. **Popup close**: Added `popupclose` handler — sidebar + operational panel auto-hide
5. **Data loading**: cities.json loaded FIRST (before API fallback) — real boundaries preferred

### Phase 8: Heatmap Inundation Visualization
- Added **Leaflet.heat** library (CDN: leaflet-heat.js)
- Replaced solid polygon fills with dynamic **heatmap layer**:
  - Gradient: blue(0) → skyblue(0.2) → green(0.4) → yellow(0.55) → orange(0.7) → red(1.0)
  - Point generation from polygon edges, centroids, and interior grid
  - Inland gradient factor: intensity decreases further from coast
  - Radius scales with wave height: 18px (≤3m) → 25px (3-5m) → 30px (5-7m) → 35px (7m+)
- Kept dashed blue polygon outlines as context layer
- Updated legend with gradient bar ("מפת חום — הצפה")
- Verified: heatmap dynamically responds to wave slider (tested 2.0m → 7.0m)

### Phase 9: Multilingual i18n (Session 2)
- Created `frontend/js/i18n.js` with 5 languages (HE, EN, RU, FR, ES)
- ~80 translation keys per language
- Language selector buttons in header
- localStorage persistence
- LTR CSS overrides for non-Hebrew languages
- All sidebar/legend/popup text translatable via t(key)

### Phase 10: Real CBS Socioeconomic Data
- Created `backend/extract_socioeconomic.py` parser
- Extracts 202 cities with real cluster (1-10) from CBS CSV
- Output: `frontend/data/socioeconomic.json` (19.6 KB)
- Ranking examples: Jerusalem=2, Tel Aviv=8, Haifa=7, Eilat=6
- Income and car ownership derived from cluster

### Phase 11: Layer Refactor
- Removed inaccurate coastline layer entirely
- Renamed "תחנות משטרה" (Police Stations) → "ערים" (Cities)
- Added real police stations from OSM Overpass API (amenity=police)
- Israel Police shield SVG icon at zoom 12+
- Filtered cities to only show those with CBS data
- Buildings symbology by flood depth (red/green/blue)

### Phase 12: Responsive Design
- 5 CSS breakpoints: 1023px, 767px, 600px, 480px, 360px
- Mobile sidebar: collapsible overlay with hamburger button
- Touch-friendly: 22px slider thumbs, 18px checkboxes
- Info modal responsive: 95vw, single-column on mobile
- Operational panel responsive grid

### Phase 13: Info Modal + Presentation
- Created info modal with 6 sections (auto-opens on load)
- "ℹ️ הסבר" button in header
- Created 8-slide presentation with python-pptx
- Created Hebrew presenter guide Word document
- Both files in `tsrs-app/` and `files_2/`

### Phase 14: Israel Weight Calibration + Sliders
- NEW: `frontend/js/weights.js` centralized module
- Israel-calibrated defaults: H=25%, V=30%, O=15%, R=18%, I=12%
- 2 presets: 🇮🇱 Israel | 🌍 International (Wood & Jones 2015)
- 5 interactive sliders (range 5-50%, step 1%)
- Auto-normalization to sum 100%
- Real-time TSRS recalculation on map polygons
- Dynamic formula display

### Phase 15: Documentation Sync + Spec Updates
- Fixed critical bug: `.header-left` had no CSS (flex layout missing)
- Info button now visible at all screen sizes (was hidden ≤360px)
- Added mobile-specific styles for weight sliders
- Updated presentation: weights in slide 3, NEW slide 4 (calibration)
- Created 4 spec appendix docs:
  - `files_2/BRD_Updates_Hebrew.docx`
  - `files_2/BRD_Updates_English.docx`
  - `files_2/TDD_Updates_Hebrew.docx`
  - `files_2/TDD_Updates_English.docx`
- Full rewrite of CLAUDE.md and Memory.md to reflect current state

## Git History
1. `Initial commit` — Full app (25 files)
2. `Add Vercel deployment config` — vercel.json + production fallback
3. `Fix OSM overlay layers` — Overpass API roads/buildings
4. `Major redesign` — Dark glassmorphism, TSRS explanations, hillshade
5. `Add real municipal boundaries` — 11 cities from OSM
5b. `Add ALL 554 Israeli municipal boundaries` — bulk Overpass query
6. `Add police icons, building symbology, demographic profiling`
7. `Fix 5 critical bugs` — Init order, syntax, demographics, popup close
8. `Add heatmap inundation visualization` — Leaflet.heat dynamic heatmap
9. `Add multilingual i18n + real CBS socioeconomic data`
10. `Major layer refactor: real police stations, rename to cities, fix data`
11. `Add info/about modal with TSRS explanation`
12. `Add responsive design for mobile phones and tablets`
13. `Add ALL 554 Israeli municipal boundaries from OSM`
14. `Israel-calibrated TSRS weights + interactive weight sliders`
15. `Documentation sync + spec updates + header fix` (current)
