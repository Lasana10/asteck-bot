#!/bin/bash
# ==============================================================================
# AFAT Sentinel: OSM to MBTiles Pipeline (Phase 2B)
# Process cameroon-latest.osm.pbf into offline vector/raster tiles for the Web App.
# ==============================================================================

set -e

# Configuration
PBF_URL="https://download.geofabrik.de/africa/cameroon-latest.osm.pbf"
DATA_DIR="../dashboard/public/data"
PBF_FILE="$DATA_DIR/cameroon-latest.osm.pbf"
MBTILES_OUT="$DATA_DIR/cameroon_offline.mbtiles"

# Ensure data directory exists
mkdir -p "$DATA_DIR"

# 1. Download the latest Cameroon extract (Geofabrik)
echo "🌍 Downloading Cameroon OSM PBF..."
if [ ! -f "$PBF_FILE" ]; then
    curl -o "$PBF_FILE" "$PBF_URL"
else
    echo "✅ PBF already exists, skipping download."
fi

# 2. Extract Yaoundé bounding box using osmium
echo "✂️ Slicing Yaoundé region from full PBF..."
YAOUNDE_BBOX="11.45,3.75,11.58,3.95"
osmium extract --bbox $YAOUNDE_BBOX "$PBF_FILE" -o "$DATA_DIR/yaounde.osm.pbf" --overwrite

# 3. Use Tilemaker to convert raw PBF data into an MBTile package (Pro Version Only)
# Note: You need a config.json (zoom levels) and process.lua (styling layers).
echo "⚙️ Running Tilemaker to compile offline MBTiles cache..."
if command -v tilemaker &> /dev/null; then
    tilemaker \
        --input "$DATA_DIR/yaounde.osm.pbf" \
        --output "$MBTILES_OUT" \
        --config tilemaker_config.json \
        --process tilemaker_process.lua
    echo "✅ Offline Map Base generated at: $MBTILES_OUT"
else
    echo "⚠️ Tilemaker is not installed. To generate the vector MBTiles, please install: https://github.com/systemed/tilemaker"
fi

echo "=================================================="
echo "🎯 Pipeline Complete!"
echo "The resulting map assets (GeoJSON overlays + MBTiles) can now be served by the Service Worker for 100% offline viewing."
echo "=================================================="
