# -*- coding: utf-8 -*-
"""
Generate LOCAL building tiles for the Mediterranean coastal band from the
Geofabrik OSM shapefile, so the buildings / 3D-buildings layers work even when
every Overpass endpoint is unreachable (the shapefile lacks building:levels, so
real levels are fetched once from Overpass by osm_id and baked into the tiles).

Output: frontend/data/buildings_tiles/{x}_{y}.json  (GeoJSON FeatureCollection,
tile grid 0.02° ≈ 2 km) + index.json listing available tile keys.

Input:  ../../OSM/gis_osm_buildings_a_free_1.shp  (all-Israel buildings)
Levels: Overpass query `way["building"]["building:levels"]` per sub-bbox,
        cached in backend/data/building_levels_cache.json (re-runs skip fetch).
"""
import json
import os
import time
import urllib.request
import urllib.parse

import shapefile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHP_PATH = os.path.join(os.path.dirname(BASE), "OSM", "gis_osm_buildings_a_free_1.shp")
TILES_DIR = os.path.join(BASE, "frontend", "data", "buildings_tiles")
LEVELS_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "building_levels_cache.json")

TILE_SIZE = 0.02  # degrees ≈ 2 km

# Approximate Mediterranean coastline: (lat, lon) south → north
COAST = [
    (31.55, 34.505), (31.70, 34.565), (31.85, 34.645), (32.00, 34.735),
    (32.15, 34.790), (32.35, 34.855), (32.55, 34.900), (32.75, 34.945),
    (32.80, 34.955), (32.83, 35.000), (32.95, 35.070), (33.10, 35.100),
]
SEA_MARGIN = 0.02      # deg west of coastline (harbors, marinas)
INLAND_MARGIN = 0.045  # deg east of coastline ≈ 4 km (tsunami-relevant band)
LAT_MIN, LAT_MAX = 31.55, 33.12

OVERPASS_ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# Fallback levels by Geofabrik 'type' when OSM has no building:levels tag
TYPE_LEVELS = {
    "apartments": 4, "residential": 4, "dormitory": 4,
    "office": 6, "commercial": 5, "hotel": 6, "hospital": 5, "university": 4,
    "house": 1, "detached": 1, "terrace": 2, "bungalow": 1,
    "hut": 1, "shed": 1, "garage": 1, "garages": 1, "cabin": 1,
    "industrial": 2, "warehouse": 2, "retail": 2, "supermarket": 1,
    "school": 3, "college": 3, "public": 3, "civic": 3,
    "church": 1, "mosque": 1, "synagogue": 1, "chapel": 1,
    "greenhouse": 1, "farm": 1, "barn": 1, "stable": 1, "construction": 2,
}
DEFAULT_LEVELS = 2  # same default the app uses for untagged Overpass buildings


def coast_lon(lat):
    """Linear interpolation of the coastline longitude at a latitude."""
    if lat <= COAST[0][0]:
        return COAST[0][1]
    for (lat1, lon1), (lat2, lon2) in zip(COAST, COAST[1:]):
        if lat <= lat2:
            t = (lat - lat1) / (lat2 - lat1)
            return lon1 + t * (lon2 - lon1)
    return COAST[-1][1]


def in_band(lon, lat):
    if not (LAT_MIN <= lat <= LAT_MAX):
        return False
    c = coast_lon(lat)
    return (c - SEA_MARGIN) <= lon <= (c + INLAND_MARGIN)


def fetch_levels_map():
    """osm_id -> building:levels for the coastal band, via Overpass (cached)."""
    if os.path.exists(LEVELS_CACHE):
        with open(LEVELS_CACHE, encoding="utf-8") as f:
            cached = json.load(f)
        print(f"Levels cache: {len(cached)} entries (skipping Overpass fetch)")
        return {int(k): v for k, v in cached.items()}

    levels = {}
    lat_step = 0.28
    sub_boxes = []
    lat = LAT_MIN
    while lat < LAT_MAX:
        lat2 = min(lat + lat_step, LAT_MAX)
        lons = [coast_lon(l) for l in (lat, lat2, (lat + lat2) / 2)]
        sub_boxes.append((lat, min(lons) - SEA_MARGIN, lat2, max(lons) + INLAND_MARGIN))
        lat = lat2

    for i, (s, w, n, e) in enumerate(sub_boxes, 1):
        query = (
            f'[out:json][timeout:30];'
            f'way["building"]["building:levels"]({s:.3f},{w:.3f},{n:.3f},{e:.3f});'
            f'out ids tags;'
        )
        print(f"  levels bbox {i}/{len(sub_boxes)} ({s:.2f}-{n:.2f})...", end=" ", flush=True)
        data = None
        for attempt in range(3):
            for endpoint in OVERPASS_ENDPOINTS:
                try:
                    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
                    req = urllib.request.Request(
                        endpoint, data=body, method="POST",
                        headers={"User-Agent": "TSRS-app/1.0 (one-time data bake)"},
                    )
                    with urllib.request.urlopen(req, timeout=45) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                    break
                except Exception:
                    continue
            if data:
                break
            time.sleep(10)
        if not data:
            print("FAILED (heuristic levels will be used here)")
            continue
        count = 0
        for el in data.get("elements", []):
            try:
                lv = int(float(el["tags"]["building:levels"]))
                if 1 <= lv <= 100:
                    levels[el["id"]] = lv
                    count += 1
            except (KeyError, ValueError, TypeError):
                pass
        print(f"{count} tagged buildings")
        time.sleep(2)

    os.makedirs(os.path.dirname(LEVELS_CACHE), exist_ok=True)
    with open(LEVELS_CACHE, "w", encoding="utf-8") as f:
        json.dump({str(k): v for k, v in levels.items()}, f)
    print(f"Levels fetched: {len(levels)} (cached to {os.path.basename(LEVELS_CACHE)})")
    return levels


def rounded(coords):
    return [[round(x, 6), round(y, 6)] for x, y in coords]


def main():
    levels_map = fetch_levels_map()

    print("Reading shapefile (1.09M buildings)...")
    sf = shapefile.Reader(SHP_PATH, encoding="utf-8")
    fields = [f[0] for f in sf.fields[1:]]
    i_osm = fields.index("osm_id")
    i_name = fields.index("name")
    i_type = fields.index("type")

    tiles = {}
    kept = 0
    with_real_levels = 0

    for idx in range(sf.numRecords):
        shp = sf.shape(idx)
        if shp.shapeTypeName != "POLYGON" or not shp.points:
            continue
        xs = [p[0] for p in shp.points]
        ys = [p[1] for p in shp.points]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        if not in_band(cx, cy):
            continue

        rec = sf.record(idx)
        osm_id_raw = rec[i_osm]
        try:
            osm_id = int(osm_id_raw)
        except (ValueError, TypeError):
            osm_id = None
        btype = (rec[i_type] or "").strip()
        name = (rec[i_name] or "").strip()

        lv = levels_map.get(osm_id)
        if lv:
            with_real_levels += 1
        else:
            lv = TYPE_LEVELS.get(btype, DEFAULT_LEVELS)

        # pyshp polygons: parts split rings; keep the outer ring only (holes
        # are irrelevant at this symbology scale and shrink the files)
        parts = list(shp.parts) + [len(shp.points)]
        ring = rounded(shp.points[parts[0]:parts[1]])
        if len(ring) < 4:
            continue

        props = {"building": btype or "yes", "building:levels": str(lv)}
        if name:
            props["name"] = name

        key = f"{int(cx // TILE_SIZE)}_{int(cy // TILE_SIZE)}"
        tiles.setdefault(key, []).append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
        kept += 1
        if kept % 50000 == 0:
            print(f"  ...{kept} buildings in band")

    os.makedirs(TILES_DIR, exist_ok=True)
    total_bytes = 0
    for key, feats in tiles.items():
        path = os.path.join(TILES_DIR, f"{key}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False)
        total_bytes += os.path.getsize(path)

    with open(os.path.join(TILES_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(tiles.keys()), f)

    print(f"\nDone: {kept} buildings ({with_real_levels} with real OSM levels)")
    print(f"Tiles: {len(tiles)} files, {total_bytes / 1024 / 1024:.1f} MB total")
    biggest = max(tiles.items(), key=lambda kv: len(kv[1]))
    print(f"Largest tile: {biggest[0]} with {len(biggest[1])} buildings")


if __name__ == "__main__":
    main()
