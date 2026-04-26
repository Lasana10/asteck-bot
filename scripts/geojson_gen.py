import json

def generate_yaounde_roads():
    # Central Yaoundé landmarks approx: 3.848, 11.502
    roads = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "r1",
                "properties": {"name": "Boulevard du 20 Mai", "type": "primary", "congestion": "high"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [11.515, 3.865], [11.517, 3.868], [11.520, 3.872]
                    ]
                }
            },
            {
                "type": "Feature",
                "id": "r2",
                "properties": {"name": "Avenue Kennedy", "type": "primary", "congestion": "medium"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [11.512, 3.863], [11.510, 3.861], [11.508, 3.859]
                    ]
                }
            },
            {
                "type": "Feature",
                "id": "r3",
                "properties": {"name": "Route de Mvan", "type": "trunk", "congestion": "critical"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [11.510, 3.840], [11.512, 3.835], [11.515, 3.830]
                    ]
                }
            },
            {
                "type": "Feature",
                "id": "r4",
                "properties": {"name": "Avenue Germaine", "type": "secondary", "congestion": "low"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [11.520, 3.860], [11.525, 3.862], [11.530, 3.865]
                    ]
                }
            }
        ]
    }
    
    with open("dashboard/public/data/yaounde_roads.geojson", "w") as f:
        json.dump(roads, f, indent=2)
    print("Generated yaounde_roads.geojson")

if __name__ == "__main__":
    generate_yaounde_roads()
