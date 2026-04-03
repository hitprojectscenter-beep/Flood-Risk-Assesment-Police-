"""
Generate municipal boundaries for ALL Israeli cities/towns from OSM Overpass API.
Fetches admin_level=8 relations (municipalities) across all of Israel.
Uses a single bulk query to avoid rate limiting issues.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import random

random.seed(42)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Israeli districts mapping for TSRS
DISTRICT_MAP = {
    # North
    "נהריה": "צפון", "עכו": "צפון", "כרמיאל": "צפון", "צפת": "צפון",
    "טבריה": "צפון", "נצרת": "צפון", "נצרת עילית": "צפון", "נוף הגליל": "צפון",
    "עפולה": "צפון", "בית שאן": "צפון", "מגדל העמק": "צפון",
    "שפרעם": "צפון", "סכנין": "צפון", "טמרה": "צפון",
    "מעלות-תרשיחא": "צפון", "קריית שמונה": "צפון",
    # Haifa
    "חיפה": "חיפה", "קריית ים": "חיפה", "קריית מוצקין": "חיפה",
    "קריית ביאליק": "חיפה", "קריית אתא": "חיפה",
    "טירת כרמל": "חיפה", "נשר": "חיפה",
    "אור עקיבא": "חיפה", "חדרה": "חיפה", "זכרון יעקב": "חיפה",
    "יקנעם עילית": "חיפה", "באקה אל-גרביה": "חיפה", "אום אל-פחם": "חיפה",
    # Center
    "נתניה": "מרכז", "הרצליה": "מרכז", "רמת השרון": "מרכז",
    "כפר סבא": "מרכז", "רעננה": "מרכז", "הוד השרון": "מרכז",
    "רמת גן": "מרכז", "גבעתיים": "מרכז", "בני ברק": "מרכז",
    "פתח תקווה": "מרכז", "ראש העין": "מרכז",
    "ראשון לציון": "מרכז", "רחובות": "מרכז", "נס ציונה": "מרכז",
    "לוד": "מרכז", "רמלה": "מרכז", "יבנה": "מרכז",
    "מודיעין-מכבים-רעות": "מרכז", "שוהם": "מרכז",
    "כפר יונה": "מרכז", "אור יהודה": "מרכז",
    "קריית אונו": "מרכז", "גבעת שמואל": "מרכז",
    # Tel Aviv
    "תל אביב - יפו": "תל-אביב", "תל אביב -יפו": "תל-אביב",
    "תל אביב-יפו": "תל-אביב",
    "בת ים": "תל-אביב", "חולון": "תל-אביב",
    # Jerusalem
    "ירושלים": "ירושלים", "בית שמש": "ירושלים",
    "מעלה אדומים": "ירושלים", "ביתר עילית": "ירושלים",
    "מודיעין עילית": "ירושלים",
    # South
    "אשדוד": "דרום", "אשקלון": "דרום", "באר שבע": "דרום",
    "אילת": "דרום", "דימונה": "דרום", "ערד": "דרום",
    "קריית גת": "דרום", "אופקים": "דרום", "נתיבות": "דרום",
    "שדרות": "דרום", "קריית מלאכי": "דרום",
    "מצפה רמון": "דרום", "ירוחם": "דרום",
    "רהט": "דרום", "טל-שבע": "דרום",
}

# Coastal cities get higher H (Hazard) scores
COASTAL_CITIES = {
    "נהריה", "עכו", "חיפה", "קריית ים", "טירת כרמל",
    "אור עקיבא", "חדרה", "נתניה", "הרצליה", "רמת השרון",
    "תל אביב - יפו", "תל אביב -יפו", "תל אביב-יפו", "תל־אביב–יפו",
    "בת ים", "ראשון לציון", "אשדוד", "אשקלון", "אילת",
}


def _is_coastal(name):
    """Check if city is coastal — handles OSM Unicode variants."""
    if name in COASTAL_CITIES:
        return True
    clean = name.replace("־", " ").replace("–", " ").replace("-", " ").replace("  ", " ")
    return clean in COASTAL_CITIES or any(c in name for c in ["נהריה", "עכו", "חיפה", "נתניה", "הרצליה", "בת ים", "אשדוד", "אשקלון", "אילת"])


def _guess_district_by_location(geom):
    """Guess police district from geometry centroid."""
    try:
        coords = geom.get("coordinates", [])
        if geom["type"] == "Polygon":
            ring = coords[0]
        elif geom["type"] == "MultiPolygon":
            ring = coords[0][0]
        else:
            return ""
        lats = [c[1] for c in ring]
        lons = [c[0] for c in ring]
        lat = sum(lats) / len(lats)
        lon = sum(lons) / len(lons)

        # Approximate district boundaries by lat/lon
        if lat > 32.6:
            if lon < 35.0:
                return "חיפה"
            return "צפון"
        elif lat > 32.0:
            if lon < 34.85:
                return "תל-אביב" if lat < 32.15 else "מרכז"
            return "מרכז"
        elif lat > 31.5:
            if lon < 34.85:
                return "מרכז"
            return "ירושלים"
        else:
            return "דרום"
    except:
        return ""


def query_overpass(query: str, timeout: int = 60) -> dict:
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            data = urllib.parse.urlencode({"data": query}).encode("utf-8")
            req = urllib.request.Request(endpoint, data=data, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"    Endpoint {endpoint}: {e}")
            time.sleep(2)
    return None


def osm_relation_to_geojson(element: dict) -> dict:
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
    if not rings:
        return []
    closed = []
    open_rings = []
    for ring in rings:
        if len(ring) >= 4 and ring[0] == ring[-1]:
            closed.append(ring)
        else:
            open_rings.append(ring)

    if not open_rings:
        return closed

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
                    m.extend(ring[1:]); used.add(i); changed = True; break
                elif _close_enough(m[-1], ring[-1]):
                    m.extend(reversed(ring[:-1])); used.add(i); changed = True; break
                elif _close_enough(m[0], ring[-1]):
                    m[:0] = ring[:-1]; used.add(i); changed = True; break
                elif _close_enough(m[0], ring[0]):
                    m[:0] = list(reversed(ring[1:])); used.add(i); changed = True; break

    for m in merged:
        if m and m[0] != m[-1]:
            m.append(m[0])
        closed.append(m)

    return closed


def _close_enough(p1, p2, threshold=0.0001):
    return abs(p1[0] - p2[0]) < threshold and abs(p1[1] - p2[1]) < threshold


def generate_tsrs_scores(name: str, is_coastal: bool) -> dict:
    seed = sum(ord(c) for c in name)
    r = lambda lo, hi: lo + ((seed * 7 + lo * 13) % (hi - lo))
    h = r(55, 95) if is_coastal else r(5, 35)
    v = r(25, 80)
    o = r(20, 70)
    ri = r(20, 75)
    ii = r(15, 65)
    tsrs = h * 0.35 + v * 0.30 + o * 0.20 + ri * 0.10 + ii * 0.05
    if tsrs >= 80: tier, tier_he = "CRITICAL", "קריטי"
    elif tsrs >= 60: tier, tier_he = "HIGH", "גבוה"
    elif tsrs >= 40: tier, tier_he = "MEDIUM", "בינוני"
    elif tsrs >= 20: tier, tier_he = "LOW", "נמוך"
    else: tier, tier_he = "MINIMAL", "מינימלי"

    return {
        "H_score": round(h, 1), "V_score": round(v, 1), "O_score": round(o, 1),
        "R_score": round(ri, 1), "I_score": round(ii, 1),
        "tsrs_score": round(tsrs, 1), "risk_tier": tier, "risk_tier_he": tier_he,
        "backup_units": 5 if tsrs >= 80 else 3 if tsrs >= 60 else 2 if tsrs >= 40 else 1,
        "priority": 1 if tsrs >= 80 else 2 if tsrs >= 60 else 3 if tsrs >= 40 else 4,
        "population": r(5000, 450000),
        "critical_facilities": r(2, 30),
        "vertical_shelters": r(3, 50),
        "evacuation_routes": r(2, 8),
        "coast_distance_km": round(r(1, 30) / 10, 1) if is_coastal else round(r(30, 150) / 10, 1),
    }


def main():
    print("=" * 60)
    print("  Fetching ALL Israeli municipal boundaries from OSM")
    print("=" * 60)

    # BULK QUERY: Get all admin_level=8 boundaries in Israel at once
    # This avoids rate limiting by making a single large request
    query = """[out:json][timeout:120];
    area["ISO3166-1"="IL"]->.israel;
    (
      relation["boundary"="administrative"]["admin_level"="8"](area.israel);
    );
    out geom;"""

    print("\n  Sending bulk query for all Israeli municipalities...")
    print("  (This may take 30-60 seconds)\n")

    result = query_overpass(query, timeout=120)

    if not result or not result.get("elements"):
        print("  FAILED: Bulk query returned no results. Trying smaller queries...")
        # Fallback: query by bounding box
        query2 = """[out:json][timeout:120];
        (
          relation["boundary"="administrative"]["admin_level"="8"](29.0,34.0,33.5,36.0);
          relation["boundary"="administrative"]["admin_level"="7"](29.0,34.0,33.5,36.0);
        );
        out geom;"""
        result = query_overpass(query2, timeout=120)

    if not result or not result.get("elements"):
        print("  FAILED: No results from Overpass API")
        return

    elements = result["elements"]
    print(f"  Received {len(elements)} administrative boundaries\n")

    features = []
    skipped = 0

    for elem in elements:
        tags = elem.get("tags", {})
        name = tags.get("name:he") or tags.get("name", "")
        name_en = tags.get("name:en", "")

        if not name:
            skipped += 1
            continue

        geom = osm_relation_to_geojson(elem)
        if not geom:
            print(f"  ⚠ {name} — geometry conversion failed")
            skipped += 1
            continue

        # Determine district — try exact match, then fuzzy match
        district = DISTRICT_MAP.get(name, "")
        if not district:
            # Fuzzy: strip dashes/special chars and try matching
            clean = name.replace("־", " ").replace("–", " ").replace("-", " ").replace("  ", " ").strip()
            district = DISTRICT_MAP.get(clean, "")
        if not district:
            # Try first word match for compound names
            for key, val in DISTRICT_MAP.items():
                if key in name or name in key:
                    district = val
                    break
        if not district:
            # Guess by lat/lon centroid from geometry
            district = _guess_district_by_location(geom)

        district_en = ""
        if district == "צפון": district_en = "North"
        elif district == "חיפה": district_en = "Haifa"
        elif district == "מרכז": district_en = "Center"
        elif district == "תל-אביב": district_en = "Tel Aviv"
        elif district == "ירושלים": district_en = "Jerusalem"
        elif district == "דרום": district_en = "South"
        else:
            district = "אחר"
            district_en = "Other"

        is_coastal = _is_coastal(name)
        scores = generate_tsrs_scores(name, is_coastal)

        station_id = (name_en or name).upper().replace(" ", "_").replace("-", "_")

        feature = {
            "type": "Feature",
            "properties": {
                "station_id": station_id,
                "station_name": name,
                "station_name_en": name_en,
                "district": district,
                "district_en": district_en,
                **scores,
            },
            "geometry": geom,
        }
        features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}

    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend", "data", "cities.json"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"\n  {'=' * 50}")
    print(f"  Saved {len(features)} cities to cities.json")
    print(f"  Skipped: {skipped}")
    print(f"  File size: {os.path.getsize(output_path) / 1024:.0f} KB")

    # Print summary by district
    districts = {}
    for feat in features:
        d = feat["properties"]["district"]
        districts[d] = districts.get(d, 0) + 1

    print(f"\n  By district:")
    for d, count in sorted(districts.items(), key=lambda x: -x[1]):
        print(f"    {d}: {count} cities")


if __name__ == "__main__":
    main()
