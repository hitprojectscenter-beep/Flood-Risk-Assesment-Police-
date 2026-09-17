"""
Add coastal municipalities that were missed by the bulk cities.json generation
(dropped due to geometry-conversion failures / name-spelling mismatches):
Tel Aviv-Yafo, Herzliya, Nahariya.

Fetches their admin boundaries individually from Overpass and appends them to
frontend/data/cities.json with the same property schema as generate_all_cities.py,
using real CBS population figures instead of the synthetic generator values.
"""
import json
import os
import time
import urllib.request
import urllib.parse

from generate_all_cities import (
    OVERPASS_ENDPOINTS,
    osm_relation_to_geojson,
    generate_tsrs_scores,
)

# (name:en match, canonical Hebrew name, district_he, district_en, real population ~CBS 2023, bbox s,w,n,e)
MISSING_CITIES = [
    ("Tel Aviv-Yafo", "תל אביב-יפו", "תל-אביב", "Tel Aviv", 474530, (32.02, 34.72, 32.15, 34.86)),
    ("Herzliya", "הרצליה", "מרכז", "Center", 106741, (32.13, 34.76, 32.20, 34.87)),
    ("Nahariya", "נהריה", "צפון", "North", 63000, (32.97, 35.05, 33.04, 35.13)),
]


def query_overpass(query: str, timeout: int = 90) -> dict:
    """Overpass query with a proper User-Agent and retry across endpoints."""
    for attempt in range(3):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                data = urllib.parse.urlencode({"data": query}).encode("utf-8")
                req = urllib.request.Request(
                    endpoint, data=data, method="POST",
                    headers={"User-Agent": "TSRS-app/1.0 (data preparation script)"},
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as e:
                print(f"    {endpoint}: {e}")
        print("    retrying in 30s (rate limit cool-down)...")
        time.sleep(30)
    return None

CITIES_JSON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "data", "cities.json",
)


def main():
    with open(CITIES_JSON, encoding="utf-8") as f:
        geojson = json.load(f)

    existing = {feat["properties"]["station_name"] for feat in geojson["features"]}
    added = 0

    for name_en_match, name_he, district, district_en, population, bbox in MISSING_CITIES:
        if name_he in existing:
            print(f"  already present: {name_he}")
            continue

        s, w, n, e = bbox
        query = (
            f'[out:json][timeout:90];'
            f'relation["boundary"="administrative"]["admin_level"="8"]({s},{w},{n},{e});'
            f'out geom;'
        )
        print(f"Querying Overpass for {name_en_match}...")
        result = query_overpass(query)
        if not result or not result.get("elements"):
            print(f"  FAILED: no results for {name_en_match}")
            continue

        elem = None
        # OSM name:en variants (e.g. Tel Aviv municipality is tagged "Tel-Aviv")
        accepted = {name_en_match, name_en_match.replace(" ", "-"), name_en_match.split("-")[0].strip(), "Tel-Aviv" if "Tel" in name_en_match else name_en_match}
        for cand in result["elements"]:
            tags = cand.get("tags", {})
            if tags.get("name:en", "") in accepted:
                elem = cand
                break
        if not elem:
            names = [c.get("tags", {}).get("name:en") for c in result["elements"]]
            print(f"  FAILED: {name_en_match} not among {names}")
            continue

        geom = osm_relation_to_geojson(elem)
        if not geom:
            print(f"  FAILED geometry conversion: {name_he}")
            continue

        scores = generate_tsrs_scores(name_he, is_coastal=True)
        scores["population"] = population
        station_id = name_en_match.upper().replace(" ", "_").replace("-", "_")

        geojson["features"].append({
            "type": "Feature",
            "properties": {
                "station_id": station_id,
                "station_name": name_he,
                "station_name_en": name_en_match,
                "district": district,
                "district_en": district_en,
                **scores,
            },
            "geometry": geom,
        })
        added += 1
        print(f"  added: {name_he} ({name_en_match}) — TSRS {scores['tsrs_score']}, pop {population:,}")
        time.sleep(3)  # be polite between queries

    if added:
        with open(CITIES_JSON, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False)
        print(f"\nSaved {len(geojson['features'])} features to cities.json (+{added})")
    else:
        print("\nNothing added")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
