# TSRS — Tsunami Station Risk Score Application

## Project Overview
GIS-based web application for assessing tsunami risk per police station territory along the Israeli Mediterranean coastline. Developed for the Israel Police as a decision-support tool for emergency resource allocation.

## Conversation Summary

### User Request (2026-04-03)
The user requested development of a GIS application based on two specification documents:
- **BRD (Business Requirements Document)** — Defines the TSRS model, stakeholders, functional requirements, and acceptance criteria
- **TDD (Technical Design Document)** — Specifies architecture (React/Leaflet + FastAPI + PostGIS), database schema, API endpoints, TSRS formula, and security model

### Key Requirements Discussed
1. **Map Object**: Must be the central UI element, based on **GOVMAP** (Israel's government mapping service)
2. **Architecture**: Standalone application (not integrated into existing Streamlit project)
3. **GOVMAP Integration**: No API token available — using open WMS services + OSM as fallback
4. **Database**: Firebase Realtime Database for data storage
5. **Geographic Engine**: Leaflet.js
6. **Data Sources**: CBS demographic CSVs (age demographics, socioeconomic profiles), QGIS2WEB exported GIS layers

### Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Standalone HTML/JS + FastAPI | Per TDD spec, not merged with existing Streamlit app |
| Map engine | Leaflet.js | Per TDD spec, lightweight, wide plugin ecosystem |
| Base map | GOVMAP WMS + OSM fallback | User requested GOVMAP; no token so using open WMS |
| Database | Firebase Realtime DB | User requested Firebase for data storage |
| Data fallback | Firebase → API → Local JSON | Ensures app works in all environments |
| Hebrew RTL | Full RTL layout | Per BRD requirement, sidebar on right |
| Station data | Sample 15 coastal stations | POC with realistic coordinates and demographics |

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Leaflet.js 1.9
- **Backend**: Python FastAPI + Uvicorn
- **Database**: Firebase Realtime Database
- **Map Services**: GOVMAP WMS, OpenStreetMap, CartoDB
- **Data**: CBS demographic CSVs, GeoJSON

## TSRS Formula
```
TSRS = H × 0.35 + V × 0.30 + O × 0.20 + R⁻¹ × 0.10 + I⁻¹ × 0.05
```
- **H** (Hazard): Inundation area percentage, wave depth, coast proximity
- **V** (Vulnerability): Elderly %, children %, economic index, mobility
- **O** (Operational): Evacuation bottleneck score
- **R** (Response): Available police resources (inverted)
- **I** (Infrastructure): Shelter availability (inverted)

## Project Structure
```
tsrs-app/
├── frontend/
│   ├── index.html          # Main RTL Hebrew UI
│   ├── css/style.css       # Responsive RTL stylesheet
│   ├── js/
│   │   ├── app.js          # Main controller
│   │   ├── map.js          # Leaflet + GOVMAP WMS
│   │   ├── tsrs.js         # Station visualization & popups
│   │   ├── controls.js     # District selector, wave slider
│   │   ├── inundation.js   # Flood zone layer
│   │   ├── operational.js  # Operational guidelines panel
│   │   └── firebase-config.js  # Firebase integration
│   └── data/               # Generated JSON data files
├── backend/
│   ├── main.py             # FastAPI server
│   ├── models/tsrs_model.py    # TSRS calculation engine
│   ├── data/geo_utils.py       # GeoJSON generators
│   ├── data/load_csv.py        # CBS data loader
│   ├── populate_firebase.py    # Firebase population script
│   └── requirements.txt
├── CLAUDE.md               # This file
└── Memory.md               # Development log
```

## Running the Application

### Option 1: Static (Local JSON)
Open `frontend/index.html` in a browser. Data loads from `frontend/data/*.json`.

### Option 2: With FastAPI Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Option 3: With Firebase
1. Create Firebase project at console.firebase.google.com
2. Update `firebase-config.js` with your project credentials
3. Run: `python backend/populate_firebase.py --credentials serviceAccountKey.json`

## Data Sources
- **ישובים_גילאים.csv** — 1,285 settlements, age group breakdown (CBS)
- **פרופיל חברתי כלכלי לפי ישובים.csv** — Socioeconomic profiles (CBS 2022)
- **QGIS2WEB layers** — OSM buildings, roads, railways, water (Jerusalem area sample)
