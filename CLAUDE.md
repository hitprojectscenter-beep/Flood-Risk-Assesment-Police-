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

## TSRS Formula
```
TSRS = H × 0.35 + V × 0.30 + O × 0.20 + R⁻¹ × 0.10 + I⁻¹ × 0.05
```

| Component | Hebrew | 3-Word Description | Weight |
|-----------|--------|-------------------|--------|
| H (Hazard) | סיכון הצפה | חשיפה לגלי צונאמי | 35% |
| V (Vulnerability) | פגיעות | פגיעות דמוגרפית | 30% |
| O (Operational) | צוואר בקבוק | קושי בפינוי | 20% |
| R (Response) | תגובה | משאבי תגובה | 10% |
| I (Infrastructure) | תשתיות | מבנים ומקלטים | 5% |

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
3. **Real city boundaries**: Overpass API script — 11 real municipal polygons from OSM
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
│       ├── cities.json         # Real municipal boundaries from OSM
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
