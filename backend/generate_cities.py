"""
Generate municipal boundaries for Israeli coastal cities from OSM Overpass API.
Saves as frontend/data/cities.json
"""
import json
import os
import sys
import time
import random
import urllib.request
import urllib.parse

random.seed(42)

# Israeli coastal cities with CBS settlement codes for demographic linkage
COASTAL_CITIES = [
    {"name": "נהריה", "name_en": "Nahariya", "district": "צפון", "district_en": "North"},
    {"name": "עכו", "name_en": "Akko", "district": "צפון", "district_en": "North"},
    {"name": "חיפה", "name_en": "Haifa", "district": "חיפה", "district_en": "Haifa"},
    {"name": "קריית ים", "name_en": "Kiryat Yam", "district": "חיפה", "district_en": "Haifa"},
    {"name": "קריית מוצקין", "name_en": "Kiryat Motzkin", "district": "חיפה", "district_en": "Haifa"},
    {"name": "קריית ביאליק", "name_en": "Kiryat Bialik", "district": "חיפה", "district_en": "Haifa"},
    {"name": "קריית אתא", "name_en": "Kiryat Ata", "district": "חיפה", "district_en": "Haifa"},
    {"name": "אור עקיבא", "name_en": "Or Akiva", "district": "חיפה", "district_en": "Haifa"},
    {"name": "חדרה", "name_en": "Hadera", "district": "חיפה", "district_en": "Haifa"},
    {"name": "נתניה", "name_en": "Netanya", "district": "מרכז", "district_en": "Center"},
    {"name": "הרצליה", "name_en": "Herzliya", "district": "מרכז", "district_en": "Center"},
    {"name": "רמת השרון", "name_en": "Ramat HaSharon", "district": "מרכז", "district_en": "Center"},
    {"name": "תל אביב - יפו", "name_en": "Tel Aviv-Yafo", "district": "תל-אביב", "district_en": "Tel Aviv"},
    {"name": "בת ים", "name_en": "Bat Yam", "district": "תל-אביב", "district_en": "Tel Aviv"},
    {"name": "חולון", "name_en": "Holon", "district": "תל-אביב", "district_en": "Tel Aviv"},
    {"name": "ראשון לציון", "name_en": "Rishon LeZion", "district": "מרכז", "district_en": "Center"},
    {"name": "אשדוד", "name_en": "Ashdod", "district": "דרום", "district_en": "South"},
    {"name": "אשקלון", "name_en": "Ashkelon", "district": "דרום", "district_en": "South"},
    {"name": "אילת", "name_en": "Eilat", "district": "דרום", "district_en": "South"},
]


def query_overpass(query: str) -> dict:
    """Query the Overpass API with retry."""
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    for endpoint in endpoints:
        try:
            data = urllib.parse.urlencode({"data": query}).encode("utf-8")
            req = urllib.request.Request(endpoint, data=data, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"  Endpoint {endpoint} failed: {e}")
            time.sleep(1)
    return None


def fetch_city_boundary(city_name: str) -> dict:
    """Fetch municipal boundary for a city from OSM."""
    query = f"""[out:json][timeout:25];
    relation["boundary"="administrative"]["admin_level"~"^(7|8)$"]["name"="{city_name}"](29.0,34.0,33.5,35.9);
    out geom;"""
    print(f"  Fetching: {city_name}...")
    result = query_overpass(query)
    if not result or not result.get("elements"):
        # Try with name:he
        query2 = f"""[out:json][timeout:25];
        relation["boundary"="administrative"]["admin_level"~"^(7|8)$"]["name:he"="{city_name}"](29.0,34.0,33.5,35.9);
        out geom;"""
        result = query_overpass(query2)
    return result


def osm_relation_to_geojson(element: dict) -> dict:
    """Convert OSM relation with 'out geom' to GeoJSON Polygon/MultiPolygon."""
    members = element.get("members", [])
    outer_rings = []
    inner_rings = []

    for member in members:
        if member.get("type") != "way":
            continue
        geom = member.get("geometry", [])
        if not geom:
            continue
        coords = [[pt["lon"], pt["lat"]] for pt in geom]
        role = member.get("role", "outer")
        if role == "inner":
            inner_rings.append(coords)
        else:
            outer_rings.append(coords)

    if not outer_rings:
        return None

    # Try to merge outer rings into closed polygons
    merged = _merge_rings(outer_rings)

    if len(merged) == 1:
        polygon = [merged[0]]
        for inner in inner_rings:
            polygon.append(inner)
        return {"type": "Polygon", "coordinates": polygon}
    else:
        multi = []
        for ring in merged:
            multi.append([ring])
        return {"type": "MultiPolygon", "coordinates": multi}


def _merge_rings(rings):
    """Merge open linestrings into closed rings."""
    if not rings:
        return []

    # If already closed rings, return them
    closed = []
    open_rings = []
    for ring in rings:
        if len(ring) >= 4 and ring[0] == ring[-1]:
            closed.append(ring)
        else:
            open_rings.append(ring)

    if not open_rings:
        return closed

    # Try to merge open rings
    merged = [list(open_rings[0])]
    used = {0}
    changed = True
    while changed:
        changed = False
        for i, ring in enumerate(open_rings):
            if i in used:
                continue
            for m in merged:
                if _close_enough(m[-1], ring[0]):
                    m.extend(ring[1:])
                    used.add(i)
                    changed = True
                    break
                elif _close_enough(m[-1], ring[-1]):
                    m.extend(reversed(ring[:-1]))
                    used.add(i)
                    changed = True
                    break
                elif _close_enough(m[0], ring[-1]):
                    m[:0] = ring[:-1]
                    used.add(i)
                    changed = True
                    break
                elif _close_enough(m[0], ring[0]):
                    m[:0] = list(reversed(ring[1:]))
                    used.add(i)
                    changed = True
                    break

    # Close any merged rings
    for m in merged:
        if m and m[0] != m[-1]:
            m.append(m[0])
        closed.append(m)

    return closed


def _close_enough(p1, p2, threshold=0.0001):
    return abs(p1[0] - p2[0]) < threshold and abs(p1[1] - p2[1]) < threshold


def generate_tsrs_scores(city: dict) -> dict:
    """Generate sample TSRS scores for a city."""
    # Vary scores by distance from coast (approximate)
    coast_cities = {"נהריה", "עכו", "חיפה", "תל אביב - יפו", "בת ים", "אשדוד", "אשקלון", "אילת",
                    "נתניה", "הרצליה", "קריית ים"}
    is_coastal = city["name"] in coast_cities

    h = random.uniform(60, 95) if is_coastal else random.uniform(20, 55)
    v = random.uniform(35, 80)
    o = random.uniform(25, 70)
    r = random.uniform(25, 75)
    i = random.uniform(20, 65)
    tsrs = h * 0.35 + v * 0.30 + o * 0.20 + r * 0.10 + i * 0.05

    if tsrs >= 80: tier, tier_he = "CRITICAL", "קריטי"
    elif tsrs >= 60: tier, tier_he = "HIGH", "גבוה"
    elif tsrs >= 40: tier, tier_he = "MEDIUM", "בינוני"
    elif tsrs >= 20: tier, tier_he = "LOW", "נמוך"
    else: tier, tier_he = "MINIMAL", "מינימלי"

    return {
        "H_score": round(h, 1), "V_score": round(v, 1), "O_score": round(o, 1),
        "R_score": round(r, 1), "I_score": round(i, 1),
        "tsrs_score": round(tsrs, 1), "risk_tier": tier, "risk_tier_he": tier_he,
        "backup_units": 5 if tsrs >= 80 else 3 if tsrs >= 60 else 2 if tsrs >= 40 else 1,
        "priority": 1 if tsrs >= 80 else 2 if tsrs >= 60 else 3 if tsrs >= 40 else 4,
        "population": random.randint(20000, 450000),
        "critical_facilities": random.randint(3, 30),
        "vertical_shelters": random.randint(5, 50),
        "evacuation_routes": random.randint(2, 8),
        "coast_distance_km": round(random.uniform(0.1, 3.0) if is_coastal else random.uniform(2.0, 8.0), 1),
    }


def main():
    print("=== Generating Israeli Coastal City Boundaries ===\n")
    features = []

    for city in COASTAL_CITIES:
        result = fetch_city_boundary(city["name"])
        time.sleep(1)  # Rate limit

        if result and result.get("elements"):
            elem = result["elements"][0]
            geom = osm_relation_to_geojson(elem)
            if geom:
                scores = generate_tsrs_scores(city)
                feature = {
                    "type": "Feature",
                    "properties": {
                        "station_id": city["name_en"].upper().replace(" ", "_").replace("-", "_"),
                        "station_name": city["name"],
                        "station_name_en": city["name_en"],
                        "district": city["district"],
                        "district_en": city["district_en"],
                        **scores,
                    },
                    "geometry": geom,
                }
                features.append(feature)
                print(f"  OK: {city['name']} — {geom['type']}")
            else:
                print(f"  WARN: {city['name']} — could not convert geometry")
        else:
            print(f"  SKIP: {city['name']} — no OSM boundary found")

    geojson = {"type": "FeatureCollection", "features": features}

    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend", "data", "cities.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"\nSaved {len(features)} cities to {output_path}")
    print(f"File size: {os.path.getsize(output_path) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
