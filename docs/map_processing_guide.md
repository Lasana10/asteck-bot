# 🗺️ AFAT Intelligence — Pro Offline Map Pipeline

This guide documents the "Phase 2B" architecture for providing deeply accurate, completely offline maps (MBTiles) specifically optimized for Cameroonian operators who traverse rural corridors and unmapped "informal" routes.

## The Challenge
Standard Leaflet map tiles require an internet connection, and standard OpenStreetMap (OSM) data frequently lacks informal road networks (paths through markets, unpaved neighborhood shortcuts) that commercial drivers rely on.

## The Solution
We blend:
1. **The Global Baseline** — `cameroon-latest.osm.pbf` from Geofabrik.
2. **The Humanitarian Overlay** — HOT (Humanitarian OpenStreetMap Team) tasks exported to GeoJSON, containing highly granular, hand-traced rural and informal paths mapped by local communities.

## Step-by-Step Pipeline

### 1. Sourcing the Raw Data
Begin by generating the `yaounde.osm.pbf` slice using `osmium`. Run:
```bash
./scripts/process_osm_tiles.sh
```
This isolates the 5MB~ bounding box for our primary operations, saving immense processing power.

### 2. Sourcing HOT Passability Data
1. Navigate to the [HOT Export Tool](https://export.hotosm.org/).
2. Select your bounding box (Yaoundé / Douala corridor).
3. Export features with `highway=*` and `surface=*`.
4. Save the resulting GeoJSON as `dashboard/public/data/hot_informal_routes.geojson`.

### 3. Rendering MBTiles via Tilemaker
The `process_osm_tiles.sh` script invokes `tilemaker` using custom configurations:
- **`tilemaker_config.json`**: Sets max zoom to `z14` (saving gigs of space, since vectors scale infinitely) and bounding box limits.
- **`tilemaker_process.lua`**: Evaluates tags. We inject a rule to color `surface=unpaved` as orange dashed lines and `highway=path` as thin red lines.

### 4. Fetching in the Service Worker
Once generated, `cameroon_offline.mbtiles` is registered in `vite.config.js` via `VitePWA` so that the browser automatically downloads it and stores it in Cache Storage upon first open. 

When the Operator loses network coverage:
1. PWA logic intercepts Leaflet's `tileLayer` network request.
2. The Service Worker returns the tile from the local `mbtiles` cache.
3. GeoJSON overlays (markets, POIs) remain layered perfectly on top natively.

## Why World-Class?
This logic takes AFAT from just a "website with a map" to a **Military-Grade Field Dispatch Tool**. It guarantees reliability in areas where 4G signals simply do not exist, an absolute necessity for local transit operations.
