"""Extract real CBS socioeconomic data from the CSV to a JSON lookup file."""
import csv
import json
import os
import sys

CSV_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "Gov.il", "אוכלוסין", "פרופיל חברתי כלכלי לפי ישובים.csv"
)
OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend", "data", "socioeconomic.json"
)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    result = {}

    with open(CSV_PATH, encoding='windows-1255') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Header is at row 4 (0-indexed)
    header = [h.strip().replace('\n', ' ') for h in rows[4]]

    # Find column indices
    name_col = 0   # שם הרשות
    code_col = 1   # סמל היישוב
    district_col = 4  # מחוז
    cluster_col = 5   # אשכול (מ-1 עד 10)

    count = 0
    for row in rows[5:]:
        if len(row) <= cluster_col:
            continue
        name = row[name_col].strip()
        code_str = row[code_col].strip().replace(',', '')
        district = row[district_col].strip()
        cluster_str = row[cluster_col].strip().replace(',', '')

        # Skip non-city rows
        try:
            code = int(float(code_str))
        except (ValueError, TypeError):
            continue

        try:
            cluster = int(float(cluster_str))
        except (ValueError, TypeError):
            cluster = 0

        if not name or name in ('כלל ארצי', 'עיריות', 'מועצות מקומיות', 'מועצות אזוריות'):
            continue

        result[name] = {
            "code": code,
            "cluster": cluster,
            "district": district,
        }
        count += 1

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Extracted {count} cities to {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")

    # Show samples
    samples = ['ירושלים', 'תל אביב -יפו', 'חיפה', 'באר שבע', 'אילת', 'נתניה']
    for s in samples:
        if s in result:
            print(f"  {s}: cluster={result[s]['cluster']}, district={result[s]['district']}")


if __name__ == '__main__':
    main()
