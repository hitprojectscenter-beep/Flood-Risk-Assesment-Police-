"""
Generate sample police station territories and inundation zones
for the TSRS POC along the Israeli Mediterranean coastline.
"""
import json
import math
import random
from typing import Dict, List, Tuple

random.seed(42)

# Israeli coastal police stations — sample data with approximate coordinates
SAMPLE_STATIONS = [
    {
        "id": "NAHARIYA", "name": "נהריה", "name_en": "Nahariya",
        "district": "צפון", "district_en": "North",
        "center": [33.005, 35.095], "coast_dist_km": 0.3,
    },
    {
        "id": "AKKO", "name": "עכו", "name_en": "Akko",
        "district": "צפון", "district_en": "North",
        "center": [32.927, 35.075], "coast_dist_km": 0.2,
    },
    {
        "id": "HAIFA_DOWNTOWN", "name": "חיפה מרכז", "name_en": "Haifa Downtown",
        "district": "חיפה", "district_en": "Haifa",
        "center": [32.815, 34.990], "coast_dist_km": 0.5,
    },
    {
        "id": "HAIFA_KRAYOT", "name": "קריות", "name_en": "Krayot",
        "district": "חיפה", "district_en": "Haifa",
        "center": [32.847, 35.075], "coast_dist_km": 1.2,
    },
    {
        "id": "HADERA", "name": "חדרה", "name_en": "Hadera",
        "district": "חיפה", "district_en": "Haifa",
        "center": [32.443, 34.895], "coast_dist_km": 2.0,
    },
    {
        "id": "NETANYA", "name": "נתניה", "name_en": "Netanya",
        "district": "מרכז", "district_en": "Center",
        "center": [32.328, 34.855], "coast_dist_km": 0.4,
    },
    {
        "id": "HERZLIYA", "name": "הרצליה", "name_en": "Herzliya",
        "district": "מרכז", "district_en": "Center",
        "center": [32.164, 34.785], "coast_dist_km": 0.6,
    },
    {
        "id": "TEL_AVIV_NORTH", "name": "תל אביב צפון", "name_en": "Tel Aviv North",
        "district": "תל-אביב", "district_en": "Tel Aviv",
        "center": [32.107, 34.775], "coast_dist_km": 0.3,
    },
    {
        "id": "TEL_AVIV_JAFFA", "name": "יפו", "name_en": "Jaffa",
        "district": "תל-אביב", "district_en": "Tel Aviv",
        "center": [32.052, 34.752], "coast_dist_km": 0.2,
    },
    {
        "id": "BAT_YAM", "name": "בת ים", "name_en": "Bat Yam",
        "district": "תל-אביב", "district_en": "Tel Aviv",
        "center": [32.023, 34.742], "coast_dist_km": 0.15,
    },
    {
        "id": "RISHON", "name": "ראשון לציון", "name_en": "Rishon LeZion",
        "district": "מרכז", "district_en": "Center",
        "center": [31.964, 34.792], "coast_dist_km": 2.5,
    },
    {
        "id": "ASHDOD", "name": "אשדוד", "name_en": "Ashdod",
        "district": "דרום", "district_en": "South",
        "center": [31.804, 34.650], "coast_dist_km": 0.8,
    },
    {
        "id": "ASHKELON", "name": "אשקלון", "name_en": "Ashkelon",
        "district": "דרום", "district_en": "South",
        "center": [31.668, 34.574], "coast_dist_km": 0.5,
    },
    {
        "id": "CAESAREA", "name": "אור עקיבא", "name_en": "Or Akiva",
        "district": "חיפה", "district_en": "Haifa",
        "center": [32.508, 34.920], "coast_dist_km": 1.0,
    },
    {
        "id": "ATLIT", "name": "עתלית", "name_en": "Atlit",
        "district": "חיפה", "district_en": "Haifa",
        "center": [32.690, 34.940], "coast_dist_km": 0.3,
    },
]


def create_polygon(center: List[float], radius_deg: float = 0.025, sides: int = 6) -> List[List[float]]:
    """Create approximate polygon around a center point."""
    coords = []
    for i in range(sides):
        angle = 2 * math.pi * i / sides + random.uniform(-0.2, 0.2)
        r = radius_deg * (1 + random.uniform(-0.3, 0.3))
        lat = center[0] + r * math.cos(angle)
        lon = center[1] + r * math.sin(angle)
        coords.append([lon, lat])
    coords.append(coords[0])
    return coords


def generate_stations_geojson() -> Dict:
    """Generate GeoJSON FeatureCollection for all sample stations."""
    features = []
    for s in SAMPLE_STATIONS:
        polygon = create_polygon(s["center"], radius_deg=0.02 + random.uniform(0, 0.015))
        # Generate TSRS component raw scores based on station characteristics
        h_raw = max(10, 100 - s["coast_dist_km"] * 30 + random.uniform(-10, 10))
        v_raw = random.uniform(30, 85)
        o_raw = random.uniform(20, 75)
        r_raw = random.uniform(25, 80)  # inverted: high = less capacity
        i_raw = random.uniform(20, 70)  # inverted: high = less shelter

        tsrs = h_raw * 0.35 + v_raw * 0.30 + o_raw * 0.20 + r_raw * 0.10 + i_raw * 0.05

        feature = {
            "type": "Feature",
            "properties": {
                "station_id": s["id"],
                "station_name": s["name"],
                "station_name_en": s["name_en"],
                "district": s["district"],
                "district_en": s["district_en"],
                "population": random.randint(15000, 120000),
                "coast_distance_km": s["coast_dist_km"],
                "H_score": round(h_raw, 1),
                "V_score": round(v_raw, 1),
                "O_score": round(o_raw, 1),
                "R_score": round(r_raw, 1),
                "I_score": round(i_raw, 1),
                "tsrs_score": round(tsrs, 1),
                "risk_tier": _get_tier(tsrs),
                "risk_tier_he": _get_tier_he(tsrs),
                "backup_units": _backup_units(tsrs),
                "priority": _priority(tsrs),
                "critical_facilities": random.randint(2, 15),
                "vertical_shelters": random.randint(3, 25),
                "evacuation_routes": random.randint(2, 6),
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [polygon],
            },
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def generate_inundation_geojson(wave_height: float) -> Dict:
    """Generate inundation zone GeoJSON based on wave height along the Israeli coast.
    Zones are always INLAND (east) of the coastline."""
    # Israeli Mediterranean coastline — denser points for Haifa bay accuracy
    coast_points = [
        # North — Nahariya to Akko
        (33.08, 35.10), (33.02, 35.09), (33.00, 35.08), (32.95, 35.07),
        # Haifa bay — detailed (coast goes east into bay then back west)
        (32.92, 35.07), (32.88, 35.04), (32.85, 35.02), (32.83, 35.00),
        (32.82, 34.98), (32.81, 34.97), (32.80, 34.97),
        # South of Haifa
        (32.77, 34.96), (32.73, 34.95), (32.70, 34.94),
        # Hadera — Netanya
        (32.60, 34.92), (32.50, 34.89), (32.45, 34.87), (32.40, 34.86),
        # Herzliya — Tel Aviv
        (32.33, 34.85), (32.25, 34.83), (32.20, 34.80), (32.15, 34.78),
        (32.10, 34.77), (32.05, 34.75), (32.02, 34.74),
        # Rishon — Ashdod — Ashkelon
        (31.97, 34.73), (31.90, 34.70), (31.84, 34.66), (31.80, 34.65),
        (31.75, 34.63), (31.70, 34.58), (31.65, 34.56),
    ]

    # Buffer distance based on wave height (approximate degrees)
    buffer_deg = wave_height * 0.003  # ~300m per meter of wave

    features = []
    for i in range(len(coast_points) - 1):
        lat1, lon1 = coast_points[i]
        lat2, lon2 = coast_points[i + 1]

        # Compute perpendicular normal vector
        dx = lon2 - lon1
        dy = lat2 - lat1
        length = math.sqrt(dx * dx + dy * dy)
        if length == 0:
            continue
        nx = -dy / length * buffer_deg
        ny = dx / length * buffer_deg

        # CRITICAL: Ensure offset goes INLAND (east = positive longitude)
        # For Israel's coast, inland is always toward higher longitude
        if nx < 0:
            nx = -nx
            ny = -ny

        depth = wave_height * random.uniform(0.3, 1.0)

        # Polygon: coastline edge → inland offset
        polygon = [
            [lon1, lat1],
            [lon2, lat2],
            [lon2 + nx, lat2 + ny],
            [lon1 + nx, lat1 + ny],
            [lon1, lat1],
        ]

        # Max depth explanation
        if depth >= 5:
            depth_desc = "הצפה חמורה — סכנת חיים מיידית"
        elif depth >= 2:
            depth_desc = "הצפה בינונית — פינוי נדרש"
        else:
            depth_desc = "הצפה קלה — זהירות"

        feature = {
            "type": "Feature",
            "properties": {
                "wave_height_m": wave_height,
                "max_depth_m": round(depth, 1),
                "max_depth_desc": depth_desc,
                "segment_id": i,
            },
            "geometry": {"type": "Polygon", "coordinates": [polygon]},
        }
        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def generate_coastline_geojson() -> Dict:
    """Generate Israeli Mediterranean coastline as a LineString."""
    coast_points = [
        [35.10, 33.08], [35.08, 33.00], [35.07, 32.92], [35.00, 32.85],
        [34.97, 32.80], [34.96, 32.75], [34.94, 32.70], [34.92, 32.60],
        [34.89, 32.50], [34.87, 32.45], [34.86, 32.40], [34.85, 32.33],
        [34.83, 32.25], [34.80, 32.20], [34.78, 32.15], [34.77, 32.10],
        [34.75, 32.05], [34.74, 32.02], [34.73, 31.97], [34.70, 31.90],
        [34.66, 31.84], [34.65, 31.80], [34.63, 31.75], [34.58, 31.70],
        [34.56, 31.65],
    ]
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "קו חוף ים תיכון", "name_en": "Mediterranean Coastline"},
            "geometry": {"type": "LineString", "coordinates": coast_points},
        }],
    }


def _get_tier(score: float) -> str:
    if score >= 80: return "CRITICAL"
    if score >= 60: return "HIGH"
    if score >= 40: return "MEDIUM"
    if score >= 20: return "LOW"
    return "MINIMAL"


def _get_tier_he(score: float) -> str:
    if score >= 80: return "קריטי"
    if score >= 60: return "גבוה"
    if score >= 40: return "בינוני"
    if score >= 20: return "נמוך"
    return "מינימלי"


def _backup_units(score: float) -> int:
    if score >= 80: return 5
    if score >= 60: return 3
    if score >= 40: return 2
    if score >= 20: return 1
    return 0


def _priority(score: float) -> int:
    if score >= 80: return 1
    if score >= 60: return 2
    if score >= 40: return 3
    if score >= 20: return 4
    return 5
