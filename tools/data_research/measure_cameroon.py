#!/usr/bin/env python3
"""AFAT reproducible local-source coverage checks. No synthetic production records.
Usage:
  python tools/data_research/measure_cameroon.py --geojson osm_roads=roads.geojson --geojson overture_places=places.geojson --gtfs douala=GTFS-SYSTRA.zip --output coverage.json
Optional input files must be legally obtained from providers; no automatic scraping.
"""
import argparse
import collections
import csv
import datetime as dt
import io
import json
import pathlib
import zipfile

CITIES = {
    "Yaounde": (11.40, 3.75, 11.65, 4.05),
    "Douala": (9.57, 3.92, 9.90, 4.20),
}
def in_box(lon, lat, box):
    return box[0] <= lon <= box[2] and box[1] <= lat <= box[3]

def points(coords):
    if not isinstance(coords, (list, tuple)):
        return
    if len(coords) >= 2 and isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
        yield float(coords[0]), float(coords[1])
    else:
        for node in coords:
            yield from points(node)

def check_geojson(name, path):
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]
    counts = collections.Counter()
    ids = set()
    duplicate_ids = 0
    missing_geometry = 0
    for feature in features:
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates")
        if coords is None:
            missing_geometry += 1
            continue
        xy = list(points(coords))
        if not xy:
            missing_geometry += 1
            continue
        ident = feature.get("id") or feature.get("properties", {}).get("id")
        if ident:
            if ident in ids:
                duplicate_ids += 1
            ids.add(ident)
        for city, box in CITIES.items():
            if any(in_box(lon, lat, box) for lon, lat in xy):
                counts[city] += 1
    return dict(name=name, type="GeoJSON", records=len(features), records_by_city=dict(counts),
                duplicate_ids=duplicate_ids, missing_geometry=missing_geometry,
                scope_note="Counts features with any vertex in city bounding box; not clipped length/area; no ground truth.")

def check_gtfs(name, path):
    with zipfile.ZipFile(path) as z:
        def read_table(table):
            try:
                data = z.read(table)
            except KeyError:
                return []
            return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
        routes = read_table("routes.txt")
        stops = read_table("stops.txt")
        calendar = read_table("calendar.txt")
        calendar_dates = read_table("calendar_dates.txt")
        by_city = collections.Counter()
        invalid = 0
        for stop in stops:
            try:
                lon, lat = float(stop["stop_lon"]), float(stop["stop_lat"])
            except (ValueError, KeyError):
                invalid += 1
                continue
            for city, box in CITIES.items():
                if in_box(lon, lat, box):
                    by_city[city] += 1
        dates = []
        for row in calendar:
            dates.extend([row.get("start_date"), row.get("end_date")])
        for row in calendar_dates:
            dates.append(row.get("date"))
        dates = sorted(d for d in dates if d and len(d) == 8 and d.isdigit())
        last = dates[-1] if dates else None
        is_current = bool(last and last >= dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d"))
        return dict(name=name, type="GTFS", routes=len(routes), stops=len(stops), stops_by_city=dict(by_city),
                    invalid_stops=invalid, service_last_date=last, has_future_or_present_service_date=is_current,
                    warning="Service calendar is only a schedule claim, not proof the transport service runs.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--geojson", action="append", default=[], help="source_name=path")
    parser.add_argument("--gtfs", action="append", default=[], help="source_name=path.zip")
    parser.add_argument("--output", default="coverage.json")
    args = parser.parse_args()
    records = []
    for kind, entries, fn in [("geojson", args.geojson, check_geojson), ("gtfs", args.gtfs, check_gtfs)]:
        for value in entries:
            if "=" not in value:
                parser.error(f"{kind}: expected name=path")
            name, path = value.split("=", 1)
            if not pathlib.Path(path).is_file():
                parser.error(f"missing input: {path}")
            records.append(fn(name, path))
    report = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
              "measurement_status": "measured" if records else "NOT_RUN_NO_INPUT_DATA",
              "city_boxes_lon_lat": CITIES,
              "limitations": ["Bounding boxes are deliberately approximate and overlap surrounding areas.",
                              "Feature counts are not comparable when source themes differ.",
                              "No completeness/accuracy conclusion without matched ground truth and manual review."],
              "sources": records}
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
if __name__ == "__main__":
    main()
