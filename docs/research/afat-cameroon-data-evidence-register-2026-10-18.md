# AFAT — Cameroon-first data evidence register
Date: 2026-10-18
Repository: Lasana10/asteck-bot
Branch: research/afat-cameroon-source-verification-20261018
Scope: Sentinel Atlas/SAR, routing, informal transit, addressless search, driver and commuter journeys, offline support, safety intelligence.
Status: **Research in progress; not production-approved.** No Cameroon citywide comparative coverage numbers have been measured here. No ingestion into Supabase has occurred.

## Evidence and selection rules
- CONFIRMED_SOURCE: authoritative provider page documents specific product/dataset.
- CONFIRMED_CAMEROON: explicit Cameroon download/coverage or Yaoundé/Douala dataset identified.
- CANDIDATE: possible provider; exact city feature counts or access not verified.
- HISTORICAL: useful for background only, not current live route/schedule claims.
- RESTRICTED: partner contract/paid account/terms verification required.
- NEVER conflate publication/update date with observation date; never infer a passable road, functioning transit service or safe route from a map/forecast alone.

## Priority matrix
|ID|Theme|Source and authoritative link|Access|Licence/conditions|Verified scope|Current decision|Remaining acceptance checks|
|---|---|---|---|---|---|---|---|
|G01|Roads+POIs|Geofabrik https://download.geofabrik.de/africa/cameroon.html|Country PBF/GPKG/SHP|OSM ODbL|CONFIRMED_CAMEROON|P0 road foundation|Get dated snapshot, road lengths by class, connectivity, attribution|
|G02|Local city GIS|TUMI Yaoundé https://portal.transport-data.org/%40tumi/geodata-yaounde-cameroon|GeoJSON archive|ODbL, OSM-derived|CONFIRMED_CAMEROON; surveyed/extracted Apr 2025; listing updated Aug 2026|P0 benchmark snapshot|Obtain bundle; compare against newer OSM; no independent coverage assumption|
|G03|POIs|Overture places https://docs.overturemaps.org/guides/places/|STAC/S3/Azure GeoParquet; bounding-box export|CDLA-Permissive 2.0/Apache 2.0 by source|CONFIRMED_SOURCE global; city quality unmeasured|P0 independently licensed POI candidate|Measure duplicate/junk/addresses Cameroon; provenance, terms|
|G04|Roads|Overture transportation https://docs.overturemaps.org/guides/transportation/|GeoParquet|ODbL|CONFIRMED_SOURCE global|P0 road comparator|Check Cameroon segment counts, restrictions, actual topology and dates|
|G05|Buildings|Overture buildings https://docs.overturemaps.org/guides/buildings/|GeoParquet|ODbL|CONFIRMED_SOURCE global|P1 footprint comparator|Check duplication, positional quality, roof vs entrance|
|G06|Building footprints|Microsoft Global ML Buildings https://github.com/microsoft/GlobalMLBuildingFootprints|Country/quadkey tiles via dataset-links.csv|CDLA-Permissive 2.0|CONFIRMED_SOURCE; global refresh Aug 2026|P0 permissive footprints candidate|Check Cameroon tile presence/number and imagery acquisition date|
|G07|Building footprints|Google Open Buildings https://sites.research.google/gr/open-buildings/|Published data download|Check current per-release licence|Previously documented Cameroon included, data not downloaded here|P1 secondary footprints|Check exact release/geometry quality/licence|
|G08|Place entity context|Wikidata https://www.wikidata.org/|SPARQL/dumps|CC0 structured data|CONFIRMED_SOURCE|P1 names/aliases|Check Cameroon place recall and accuracy|
|G09|Addressless locations|Plus Codes https://plus.codes/|Library/algorithm|Check code implementation licence|Global grid algorithm|P0 supplement|Do not mistake code for named address/entrance|
|G10|Addresses|OpenAddresses https://openaddresses.io/|Country source files|Per-source; verify|CANDIDATE Cameroon|Discovery only|Inspect country coverage and source licences|
|T01|Informal transit|Digital Transport for Africa Douala https://gitlab.com/digitaltransport/data/africa/douala|GTFS repository|Verify repository/data licence|CONFIRMED_CAMEROON; historic records|P0 historical route leads|Read calendar dates; operator verify; no live schedule claims|
|T02|Transit catalog|Mobility Database https://mobilitydatabase.org/|GTFS discovery/download|Feed-specific|CANDIDATE|Source discovery|Verify any newer Cameroon feeds and rights|
|T03|Transport feeds|Transitland https://www.transit.land/|Feed catalog/API|Service plan/feed-specific|CANDIDATE|Cross-reference feeds|Deduplicate historic feeds; verify coverage|
|T04|Transport format|GTFS https://gtfs.org/|Specification|Open format, not a dataset|CONFIRMED_SOURCE|P0 modeling|Model frequency-based and flexible service separately|
|T05|Operators|Cameroon carriers, taxi/moto associations, municipalities|Field agreement|Partner-required|RESTRICTED|P0 live ground truth|Consent, commercial rights, driver safety, governance|
|I01|Street-level imagery|Mapillary https://help.mapillary.com/hc/en-us/articles/4407521157138-Downloading-map-data-via-the-Mapillary-web-app|web GeoJSON/API|CC-BY-SA for imagery; Mapillary terms/commercial conditions|CONFIRMED_SOURCE global; Cameroon density unmeasured|P1 sign/entrance validation|API permission, commercial terms, coverage|
|I02|Street-level imagery|KartaView https://kartaview.org/|API/data|Check specific data licence|CANDIDATE|P2 alternative imagery|Measure city coverage|
|I03|Visual localization|Niantic Spatial https://www.nianticspatial.com/|SDK/partner workflows|Restricted terms|CANDIDATE, no open Pokémon GO map|Experimental only|Hardware, cost, ground capture, privacy|
|E01|Rain and forecasts|Open-Meteo https://open-meteo.com/en/pricing|API|FREE API NON-COMMERCIAL ONLY; paid commercial API|CONFIRMED_SOURCE global|P1 risk context|Paid terms, Cameroon spatial resolution, calibration|
|E02|Flood model|GloFAS via Copernicus https://global-flood.emergency.copernicus.eu/|Forecast datasets|Dataset-specific|CONFIRMED_SOURCE global|P2 river risk|Not street-passability proof|
|E03|Imagery/environment|Digital Earth Africa https://www.digitalearthafrica.org/|EO catalogs/tools|Product-dependent|CONFIRMED_SOURCE|P1 changing surface/water|City observation dates/cloud cover, licence|
|E04|Fire|NASA FIRMS https://firms.modaps.eosdis.nasa.gov/|API/download|Verify usage/attribution|CONFIRMED_SOURCE|P2 contextual hazard|No automatic road-closure alerts|
|C01|Population|WorldPop https://hub.worldpop.org/|Raster download|Dataset/version-specific|Cameroon dataset previously identified|P1 demand analysis|Date, uncertainty, commercial licence|
|C02|Health facilities|Healthsites https://healthsites.io/|download/API|Verify licence/version|CONFIRMED_SOURCE|P1 emergency destinations|Verify hospitals/active entrances|
|C03|Humanitarian|HDX https://data.humdata.org/|Dataset downloads|Dataset-specific|CANDIDATE|P2 supplemental|Discover Cameroon authoritative producers|
|C04|Settlements|GRID3 https://grid3.org/|Country-dependent|Dataset-specific|CANDIDATE|P2 potential rural coverage|Confirm Cameroon products|
|C05|Urbanization|GHSL https://ghsl.jrc.ec.europa.eu/|Raster datasets|Product-specific|CONFIRMED_SOURCE global|P2 expansion planning|Scale suitability|
|R01|Routing|Valhalla https://github.com/valhalla/valhalla|Self-host OSS|Code licence; input data separate|CONFIRMED_SOURCE|P0 route candidate|Benchmark travel time, snapping, restrictions|
|R02|Routing|OSRM https://github.com/Project-OSRM/osrm-backend|Self-host OSS|Code licence; input data separate|CONFIRMED_SOURCE|P0 routing benchmark|Travel-time, fallback, road topology|
|R03|Multimodal|OpenTripPlanner https://www.opentripplanner.org/|Self-host OSS|Code licence; requires reliable GTFS|CONFIRMED_SOURCE|P1 once reliable feeds|Assess informal transport fit|
|R04|Map display|MapLibre https://maplibre.org/|Open SDK|Code licence; tile data separate|CONFIRMED_SOURCE|P0 renderer|Offline/cache/attribution checks|
|R05|Map tile infrastructure|VersaTiles https://versatiles.org/|Self-host OSS|Code licence + map data|CONFIRMED_SOURCE|P1 cost benchmark|Hosting cost, updates|
|R06|Spatial analysis|PostGIS https://postgis.net/|PostgreSQL extension|OSS|CONFIRMED_SOURCE|P0 canonical spatial store|Geographic partitioning, performance, isolation|
|R07|Offline navigation reference|Organic Maps https://organicmaps.app/|OSS|Check application/code licence|CONFIRMED_SOURCE|P2 architecture reference|Avoid copying incompatible code|
|R08|Spatial analytics|H3 https://h3geo.org/|OSS|OSS|CONFIRMED_SOURCE|P1 aggregation|Resolution/precision and privacy|

## Legal architecture (required)
- Maintain distinct raw datasets and licence/provenance metadata: source, source_id, retrieved_at, observed_at, release_id, licence and commercial_use_decision.
- **Do not assume that joining permissive Overture places with OSM yields an unrestricted export.** Derivative database determination requires review.
- **Overture buildings and transportation are ODbL, unlike its places theme.**
- Google Maps Places, map imagery and other commercial APIs must not be bulk-copied into the permanent canonical corpus without contractual permission.
- Mapillary imagery is not a blanket right to harvest the entire provider's map; verify access terms.
- No storing personal journeys without clear purpose, permissions, retention schedule and deletion procedures.

## Reproducible comparison gates
1. Download legally permitted dated Cameroon files to secure staging (never commit bulk third-party data to GitHub).
2. Record SHA256, bytes, observed/snapshot date, acquisition date, licence and exact source URL.
3. Derive city **administrative boundaries** from trusted polygons, rather than treating rough bboxes as definitive.
4. Sample roads by class and connected-network length; compare missing links with local GPS test traces and field surveys.
5. Match buildings by IoU and centroid distance; visually sample false positives.
6. Match POIs by normalized name/alias, distance and category; audit duplication and contact details.
7. Check GTFS calendar, frequency logic and direct operator confirmation; archival feeds MUST remain archival.
8. Benchmark route alternatives on agreed GPS journeys; track ETA error percentiles, missing roads, traversal restrictions.
9. Benchmark mobile offline packs, tile bytes, download time and cold-start navigation.
10. Include fail-safe provenance, update TTL, immutable evidence trails and incident confirmation confidence.
11. Publish machine-readable output and review in PR; do not turn on live user-facing claims until accepted.

## Minimum acceptance thresholds (proposed, NOT measured)
- No unattributed/licence-unknown dataset enters production.
- Zero historical GTFS schedules labelled live.
- Zero weather-only risk indicators labelled confirmed road obstruction.
- At least 100 independently verified urban trips across Yaoundé and Douala prior to any claim of reliable ETA.
- At least 100 visually or locally checked destination/entrance samples per target city.
- Report false-positive/false-negative rates, duplicate rates and differences between candidate stacks before adoption.

## Current blockers
- Full city datasets have **not** been downloaded or benchmarked in this environment.
- Provider credentials/licensing approval and actual city ground truth are not established.
- Production ingestion/Supabase and live app integration have not been attempted on this research branch.

## Immediate execution
`python tools/data_research/measure_cameroon.py --geojson osm_roads=/path/roads.geojson --geojson overture_places=/path/places.geojson --gtfs douala=/path/douala.gtfs.zip --output /path/coverage.json`
This produces a measured count of eligible source input features and route calendar dates; it does **not** establish accuracy/coverage completeness. If files are missing, the script errors rather than manufacturing figures.

## Primary references checked 2026-10-18
- Geofabrik Cameroon: https://download.geofabrik.de/africa/cameroon.html
- Overture places: https://docs.overturemaps.org/guides/places/
- Overture transportation: https://docs.overturemaps.org/guides/transportation/
- Overture buildings: https://docs.overturemaps.org/guides/buildings/
- TUMI Yaoundé: https://portal.transport-data.org/%40tumi/geodata-yaounde-cameroon
- Microsoft footprints: https://github.com/microsoft/GlobalMLBuildingFootprints
- DTA Douala: https://gitlab.com/digitaltransport/data/africa/douala
- Mapillary downloading: https://help.mapillary.com/hc/en-us/articles/4407521157138-Downloading-map-data-via-the-Mapillary-web-app
- Open-Meteo terms: https://open-meteo.com/en/terms
