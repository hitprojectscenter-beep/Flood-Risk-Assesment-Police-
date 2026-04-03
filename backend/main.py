"""
TSRS Application — FastAPI Backend
Serves station data, TSRS scores, inundation layers, and operational guidelines.
"""
import os
import json
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from data.geo_utils import (
    generate_stations_geojson,
    generate_inundation_geojson,
    generate_coastline_geojson,
    SAMPLE_STATIONS,
)

app = FastAPI(title="TSRS — Tsunami Station Risk Score", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-generate station data
_stations_geojson = generate_stations_geojson()
_coastline_geojson = generate_coastline_geojson()

# Build lookup by station_id
_stations_by_id = {}
for f in _stations_geojson["features"]:
    _stations_by_id[f["properties"]["station_id"]] = f


@app.get("/api/districts")
def get_districts():
    """Return list of police districts."""
    districts = [
        {"id": "all", "name": "כל הארץ", "name_en": "All Country"},
        {"id": "north", "name": "צפון", "name_en": "North"},
        {"id": "haifa", "name": "חיפה", "name_en": "Haifa"},
        {"id": "center", "name": "מרכז", "name_en": "Center"},
        {"id": "tel_aviv", "name": "תל-אביב", "name_en": "Tel Aviv"},
        {"id": "south", "name": "דרום", "name_en": "South"},
    ]
    return districts


DISTRICT_MAP = {
    "north": "צפון",
    "haifa": "חיפה",
    "center": "מרכז",
    "tel_aviv": "תל-אביב",
    "south": "דרום",
}


@app.get("/api/stations")
def get_stations(district: str = Query(default="all")):
    """Return station GeoJSON, optionally filtered by district."""
    if district == "all":
        return _stations_geojson

    district_he = DISTRICT_MAP.get(district, district)
    filtered = {
        "type": "FeatureCollection",
        "features": [
            f for f in _stations_geojson["features"]
            if f["properties"]["district"] == district_he
        ],
    }
    return filtered


@app.get("/api/stations/{station_id}")
def get_station(station_id: str):
    """Return single station details with full TSRS breakdown."""
    feature = _stations_by_id.get(station_id)
    if not feature:
        return JSONResponse(status_code=404, content={"error": "Station not found"})

    props = feature["properties"]
    return {
        "station_id": props["station_id"],
        "station_name": props["station_name"],
        "district": props["district"],
        "tsrs_score": props["tsrs_score"],
        "risk_tier": props["risk_tier"],
        "risk_tier_he": props["risk_tier_he"],
        "components": {
            "H": {"score": props["H_score"], "weight": 0.35, "contribution": round(props["H_score"] * 0.35, 2)},
            "V": {"score": props["V_score"], "weight": 0.30, "contribution": round(props["V_score"] * 0.30, 2)},
            "O": {"score": props["O_score"], "weight": 0.20, "contribution": round(props["O_score"] * 0.20, 2)},
            "R": {"score": props["R_score"], "weight": 0.10, "contribution": round(props["R_score"] * 0.10, 2)},
            "I": {"score": props["I_score"], "weight": 0.05, "contribution": round(props["I_score"] * 0.05, 2)},
        },
        "recommended_backup_units": props["backup_units"],
        "priority": props["priority"],
        "population": props["population"],
        "critical_facilities": props["critical_facilities"],
        "vertical_shelters": props["vertical_shelters"],
        "evacuation_routes": props["evacuation_routes"],
    }


@app.get("/api/inundation")
def get_inundation(wave_height: float = Query(default=2.0, ge=0.5, le=10.0)):
    """Return inundation zone GeoJSON for given wave height."""
    return generate_inundation_geojson(wave_height)


@app.get("/api/coastline")
def get_coastline():
    """Return Israeli Mediterranean coastline GeoJSON."""
    return _coastline_geojson


@app.get("/api/tsrs/{station_id}")
def get_tsrs(station_id: str):
    """Return TSRS score breakdown for a specific station."""
    feature = _stations_by_id.get(station_id)
    if not feature:
        return JSONResponse(status_code=404, content={"error": "Station not found"})
    props = feature["properties"]
    return {
        "station_id": props["station_id"],
        "station_name": props["station_name"],
        "tsrs_score": props["tsrs_score"],
        "risk_tier": props["risk_tier"],
        "components": {
            "H": {"score": props["H_score"], "weight": 0.35, "label": "Hazard", "label_he": "סיכון הצפה"},
            "V": {"score": props["V_score"], "weight": 0.30, "label": "Vulnerability", "label_he": "פגיעות"},
            "O": {"score": props["O_score"], "weight": 0.20, "label": "Operational", "label_he": "צוואר בקבוק"},
            "R": {"score": props["R_score"], "weight": 0.10, "label": "Response", "label_he": "יכולת תגובה"},
            "I": {"score": props["I_score"], "weight": 0.05, "label": "Infrastructure", "label_he": "תשתיות"},
        },
    }


@app.get("/api/operational/{station_id}")
def get_operational(station_id: str, wave_height: float = Query(default=2.0)):
    """Return operational guidelines for a station at given wave height."""
    feature = _stations_by_id.get(station_id)
    if not feature:
        return JSONResponse(status_code=404, content={"error": "Station not found"})

    props = feature["properties"]
    tsrs = props["tsrs_score"]

    # Determine evacuation mode based on wave height and TSRS
    if wave_height >= 5:
        evac_mode = "MANDATORY"
        evac_mode_he = "חובה"
    elif wave_height >= 2:
        evac_mode = "RECOMMENDED"
        evac_mode_he = "מומלץ"
    else:
        evac_mode = "ADVISORY"
        evac_mode_he = "המלצה"

    # Severity label
    if wave_height >= 5:
        severity = "קיצוני"
    elif wave_height >= 3:
        severity = "חזק"
    elif wave_height >= 1.5:
        severity = "בינוני"
    else:
        severity = "נמוך"

    return {
        "station_id": station_id,
        "station_name": props["station_name"],
        "wave_height": wave_height,
        "severity": severity,
        "tsrs_score": tsrs,
        "risk_tier_he": props["risk_tier_he"],
        "evacuation": {
            "mode": evac_mode,
            "mode_he": evac_mode_he,
            "estimated_population_at_risk": int(props["population"] * min(wave_height / 10.0, 0.5)),
        },
        "resource_allocation": {
            "backup_units_needed": props["backup_units"],
            "priority_level": props["priority"],
            "critical_facilities_count": props["critical_facilities"],
            "vertical_shelters_available": props["vertical_shelters"],
            "evacuation_routes_count": props["evacuation_routes"],
        },
        "guidelines": _generate_guidelines(props, wave_height),
    }


def _generate_guidelines(props: dict, wave_height: float) -> list:
    """Generate operational guidelines in Hebrew based on station data."""
    guidelines = []
    tsrs = props["tsrs_score"]

    if tsrs >= 60:
        guidelines.append(f"תחנה בעדיפות {props['priority']} — נדרש גיבוי מיידי של {props['backup_units']} ניידות")
    else:
        guidelines.append(f"תחנה בעדיפות {props['priority']} — כוננות רגילה")

    if wave_height >= 3:
        guidelines.append(f"פינוי אוכלוסייה עד {int(props['coast_distance_km'] * 1000 + wave_height * 200)}מ' מקו החוף")
    guidelines.append(f"הפניית אוכלוסייה ל-{props['vertical_shelters']} מבני מקלט אנכי באזור")
    guidelines.append(f"חסימת {props['evacuation_routes']} צירי פינוי ראשיים")

    if props["critical_facilities"] > 5:
        guidelines.append(f"תיאום פינוי {props['critical_facilities']} מוסדות קריטיים (בתי ספר, בתי חולים)")

    return guidelines


# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
