# TSRS Application — Development Memory Log

## Session: 2026-04-03

### Phase 1: Requirements Analysis

**Action**: Read BRD and TDD specification documents (Hebrew .docx files)
- BRD: Defines TSRS model for Israel Police tsunami preparedness
- TDD: Full technical architecture — React/Leaflet + FastAPI + PostGIS
- Extracted using Python zipfile for XML parsing (pandoc not available for Hebrew)

**Action**: Read CBS demographic data files
- `ישובים_גילאים.csv` (1,285 rows) — Windows-1255 encoding
  - Columns: סמל_ישוב, שם_ישוב, נפה, סהכ, גיל_0_5, גיל_6_18, גיל_19_45, גיל_46_55, גיל_56_64, גיל_65_פלוס
- `פרופיל חברתי כלכלי לפי ישובים.csv` — Multi-header CBS format, 125+ columns
  - Contains socioeconomic index, compactness, peripherality, housing data

**Action**: Analyzed QGIS2WEB export
- 7 OSM layers: natural areas, places, railways, roads, water, buildings, waterways
- Covers Jerusalem area (31.72-31.78 lat, 35.14-35.29 lon)
- Uses Leaflet.js with GeoJSON data

**Action**: Researched GOVMAP API
- JavaScript API at `https://www.govmap.gov.il/govmap/api/govmap.api.js`
- WMS endpoint: `https://open.govmap.gov.il/geoserver/opendata/wms`
- Uses ITM (EPSG:2039) coordinate system — needs projection handling
- Token required for full API, but WMS is open

### Phase 2: Architecture Decisions

**User Decision**: Standalone application (not Streamlit integration)
**User Decision**: No GOVMAP token — use open WMS + OSM fallback
**User Decision**: Firebase Realtime Database for data storage
**User Decision**: Leaflet.js as geographic engine

**Architecture chosen**:
```
Frontend (HTML/JS/Leaflet) ↔ Firebase Realtime DB
                          ↔ FastAPI Backend (fallback)
                          ↔ Local JSON files (fallback)
```

### Phase 3: Implementation

#### Step 1: Project Scaffolding
- Created directory structure: `tsrs-app/frontend/`, `tsrs-app/backend/`
- Created subdirectories: `css/`, `js/`, `data/`, `routers/`, `models/`

#### Step 2: Backend — TSRS Engine
- **`backend/models/tsrs_model.py`**: TSRS formula implementation
  - `compute_tsrs(H, V, O, R_inv, I_inv)` with weights [0.35, 0.30, 0.20, 0.10, 0.05]
  - `normalize_min_max()` for 0-100 normalization
  - `compute_vulnerability()` from demographic data
  - `compute_hazard()` from flooding metrics
  - Risk tiers: CRITICAL (80+), HIGH (60+), MEDIUM (40+), LOW (20+), MINIMAL (0+)

#### Step 3: Backend — Data Utilities
- **`backend/data/load_csv.py`**: CBS data loader with Windows-1255 encoding
  - `load_age_demographics()` — processes age CSV, computes pct_children, pct_elderly
  - `aggregate_by_nafa()` — aggregate demographics by police district

- **`backend/data/geo_utils.py`**: GeoJSON generator
  - 15 sample coastal police stations (Nahariya to Ashkelon)
  - `generate_stations_geojson()` — polygons with TSRS scores
  - `generate_inundation_geojson(wave_height)` — flood zones based on coastal buffer
  - `generate_coastline_geojson()` — Mediterranean coastline LineString

#### Step 4: Backend — FastAPI Server
- **`backend/main.py`**: REST API endpoints
  - `GET /api/districts` — list of police districts
  - `GET /api/stations?district=` — station GeoJSON
  - `GET /api/stations/{id}` — single station details
  - `GET /api/inundation?wave_height=` — inundation GeoJSON
  - `GET /api/coastline` — coastline GeoJSON
  - `GET /api/tsrs/{id}` — TSRS score breakdown
  - `GET /api/operational/{id}?wave_height=` — operational guidelines
  - Static file serving for frontend

#### Step 5: Frontend — Map Module
- **`frontend/js/map.js`**: Leaflet map initialization
  - Base layers: OSM, CartoDB Light, CartoDB Dark, GOVMAP WMS
  - Centered on Israeli coast [32.0, 34.78], zoom 9
  - Zoom control on top-left, scale bar on bottom-left
  - Layer control for base map switching

#### Step 6: Frontend — TSRS Visualization
- **`frontend/js/tsrs.js`**: Station layer rendering
  - Color-coded polygons by TSRS score (green → red)
  - Click popup with score breakdown bars
  - Sidebar summary panel on station select
  - Data fallback chain: Firebase → API → Local JSON

#### Step 7: Frontend — Controls
- **`frontend/js/controls.js`**: UI controls
  - District selector dropdown with map fly-to
  - Wave height slider (0.5-10m) with severity badge
  - Layer toggle checkboxes
  - Real-time Hebrew date/time display

#### Step 8: Frontend — Inundation Layer
- **`frontend/js/inundation.js`**: Flood zone visualization
  - Dynamic coloring: yellow (0.5-2m), orange (2-5m), red (5m+)
  - Dashed blue border on flood zone edges
  - Debounced update on slider change
  - Coastline layer with toggle

#### Step 9: Frontend — Operational Output
- **`frontend/js/operational.js`**: Guideline panel
  - Bottom overlay panel with station operational data
  - Grid cards: TSRS score, wave height, evacuation mode, backup units
  - Dynamic Hebrew guidelines based on TSRS + wave height
  - Close button

#### Step 10: Firebase Integration
- **`frontend/js/firebase-config.js`**: Firebase Realtime DB
  - Init with config, fallback if SDK not loaded
  - Read functions: getStations, getInundation, getCoastline, getOperational
  - Write functions for data population script
  - Added Firebase compat SDK to index.html

#### Step 11: Data Population
- **`backend/populate_firebase.py`**: Data generation + upload
  - Generates all GeoJSON locally (stations, coastline, 20 inundation levels)
  - Saves to `frontend/data/` as JSON files
  - Optional upload to Firebase with `--credentials` flag
  - Generated 4 JSON files: stations.json, coastline.json, inundation.json, stations_db.json

#### Step 12: Frontend — HTML & CSS
- **`frontend/index.html`**: Full RTL Hebrew layout
  - Header with app title and datetime
  - Right sidebar: district selector, wave slider, layer toggles, legend, station summary
  - Central map area
  - Bottom operational panel overlay
  - Firebase SDK + Leaflet CDN links

- **`frontend/css/style.css`**: RTL-first responsive design
  - CSS variables for color scheme (police blue theme)
  - Assistant Hebrew font
  - Sidebar on right (RTL), controls, legend, severity badges
  - Popup styles with TSRS component bars
  - Operational panel grid layout
  - Responsive breakpoints for tablet/mobile

### Phase 4: Documentation
- Created CLAUDE.md — conversation summary and project documentation
- Created Memory.md — this file, complete development log

### Phase 5: Git & Deploy
- Initialize git repository
- Push to: https://github.com/hitprojectscenter-beep/Flood-Risk-Assesment-Police-.git

---

## Files Created (Total: 18)

| # | File | Purpose |
|---|------|---------|
| 1 | `frontend/index.html` | Main HTML page (RTL Hebrew) |
| 2 | `frontend/css/style.css` | RTL responsive stylesheet |
| 3 | `frontend/js/app.js` | Main application controller |
| 4 | `frontend/js/map.js` | Leaflet + GOVMAP map module |
| 5 | `frontend/js/tsrs.js` | TSRS visualization & popups |
| 6 | `frontend/js/controls.js` | UI controls (district, slider) |
| 7 | `frontend/js/inundation.js` | Flood zone layer |
| 8 | `frontend/js/operational.js` | Operational guidelines panel |
| 9 | `frontend/js/firebase-config.js` | Firebase integration |
| 10 | `frontend/data/stations.json` | Generated station GeoJSON |
| 11 | `frontend/data/coastline.json` | Generated coastline GeoJSON |
| 12 | `frontend/data/inundation.json` | Generated inundation zones |
| 13 | `frontend/data/stations_db.json` | Firebase-format stations |
| 14 | `backend/main.py` | FastAPI server |
| 15 | `backend/models/tsrs_model.py` | TSRS calculation engine |
| 16 | `backend/data/geo_utils.py` | GeoJSON generation utilities |
| 17 | `backend/data/load_csv.py` | CBS demographic data loader |
| 18 | `backend/populate_firebase.py` | Firebase data population script |
