"""
Firebase Data Population Script for TSRS Application.
Generates all GeoJSON data and uploads to Firebase Realtime Database.

Usage:
    pip install firebase-admin
    python populate_firebase.py --credentials path/to/serviceAccountKey.json

Or run without Firebase to just generate local JSON files:
    python populate_firebase.py --local
"""
import argparse
import json
import os
import sys

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data.geo_utils import (
    generate_stations_geojson,
    generate_inundation_geojson,
    generate_coastline_geojson,
)


def generate_all_data():
    """Generate all GeoJSON datasets."""
    print("Generating station data...")
    stations = generate_stations_geojson()

    print("Generating coastline...")
    coastline = generate_coastline_geojson()

    print("Generating inundation zones for wave heights 0.5-10.0m...")
    inundation = {}
    wave_heights = [h * 0.5 for h in range(1, 21)]  # 0.5 to 10.0
    for wh in wave_heights:
        key = f"wh_{wh:.1f}".replace('.', '_')
        inundation[key] = generate_inundation_geojson(wh)

    return stations, coastline, inundation


def save_local(stations, coastline, inundation, output_dir):
    """Save all data as local JSON files."""
    os.makedirs(output_dir, exist_ok=True)

    with open(os.path.join(output_dir, "stations.json"), "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)

    with open(os.path.join(output_dir, "coastline.json"), "w", encoding="utf-8") as f:
        json.dump(coastline, f, ensure_ascii=False, indent=2)

    with open(os.path.join(output_dir, "inundation.json"), "w", encoding="utf-8") as f:
        json.dump(inundation, f, ensure_ascii=False, indent=2)

    # Also save stations as individual entries (Firebase format)
    stations_db = {}
    for feature in stations["features"]:
        sid = feature["properties"]["station_id"]
        stations_db[sid] = feature
    with open(os.path.join(output_dir, "stations_db.json"), "w", encoding="utf-8") as f:
        json.dump(stations_db, f, ensure_ascii=False, indent=2)

    print(f"Data saved to {output_dir}/")


def upload_to_firebase(stations, coastline, inundation, credentials_path):
    """Upload all data to Firebase Realtime Database."""
    try:
        import firebase_admin
        from firebase_admin import credentials, db
    except ImportError:
        print("ERROR: firebase-admin package not installed.")
        print("Install with: pip install firebase-admin")
        return False

    cred = credentials.Certificate(credentials_path)
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://tsrs-flood-risk-default-rtdb.firebaseio.com'
    })

    print("Uploading stations to Firebase...")
    stations_ref = db.reference('stations')
    stations_db = {}
    for feature in stations["features"]:
        sid = feature["properties"]["station_id"]
        stations_db[sid] = feature
    stations_ref.set(stations_db)

    print("Uploading coastline to Firebase...")
    db.reference('coastline').set(coastline)

    print("Uploading inundation zones to Firebase...")
    db.reference('inundation').set(inundation)

    print("Firebase upload complete!")
    return True


def main():
    parser = argparse.ArgumentParser(description="Populate TSRS data")
    parser.add_argument("--credentials", help="Path to Firebase serviceAccountKey.json")
    parser.add_argument("--local", action="store_true", help="Save as local JSON files only")
    parser.add_argument("--output", default="../frontend/data", help="Output directory for local files")
    args = parser.parse_args()

    stations, coastline, inundation = generate_all_data()

    # Always save locally
    save_local(stations, coastline, inundation, args.output)

    # Upload to Firebase if credentials provided
    if args.credentials:
        upload_to_firebase(stations, coastline, inundation, args.credentials)
    elif not args.local:
        print("\nTo upload to Firebase, run with:")
        print("  python populate_firebase.py --credentials path/to/serviceAccountKey.json")


if __name__ == "__main__":
    main()
