# AFAT map-source and offline-map foundation

This document separates what exists in the repository from what still requires data, infrastructure, and deployment. External map records are evidence candidates; they do not become AFAT place truth without an audited review.

## Implemented locally

- A governed source catalog for AFAT internal data, OpenStreetMap, Overture Maps, and Foursquare Open Source Places.
- Provenance, licence snapshots, versioned import batches, spatial source records, and review status.
- Targeted GeoJSON preparation and a bounded API import path (500 point records and a maximum 1.5-degree bounding box per batch).
- Dry-run validation by default.
- An audited, staff-only review action that can promote an external candidate into `afat_places`.
- Confidence history and explicit separation between a place candidate, a reviewed AFAT place, and a separately verified meeting point.

The database migration is `db/20260811_map_source_foundation.sql`. The API is `src/api/mapFoundation.ts`. Neither has been deployed merely because it exists in Git.

## External-source workflow

1. Obtain a lawful, versioned extract from the source's official distribution channel.
2. Limit the extract to the pilot area, initially Yaounde.
3. Convert point features to GeoJSON with stable source IDs and names.
4. Prepare a bounded request locally:

```bash
node scripts/prepare-map-import.mjs \
  --input data/yaounde-overture-places.geojson \
  --source overture_maps \
  --version 2026-06-17.0 \
  --scope "Yaounde pilot" \
  --bbox 11.40,3.75,11.62,3.95 \
  --output /tmp/afat-overture-import.json
```

5. Submit the generated request to `POST /api/ops/map/imports` using a staff account with `map.import.manage`. The request is a dry run unless the preparer receives `--apply`.
6. Review candidates in operations. Approval requires `map.evidence.review`, AAL2, and a written reason.
7. Verify entrances and meeting points separately in the field. Source presence alone is not proof of vehicle access or pickup safety.

The repository does not silently download or bulk-load Overture or Foursquare data. Dataset access, licence review, geographic extraction, migration application, and a staff-authorized API request are deployment steps.

## OpenStreetMap and rendered tiles

`scripts/process_osm_tiles.sh` can prepare a Cameroon OSM extract and run local tile tooling when its external dependencies are installed. It is preparation tooling, not proof that an offline map is already served by the AFAT PWA.

The current web renderer is Leaflet. A browser cannot natively answer Leaflet tile requests from a raw MBTiles SQLite file merely because the file was placed in a service-worker cache. A production offline implementation still needs one of:

- PMTiles with a compatible browser protocol and renderer;
- a tile server that reads MBTiles; or
- a deliberately tested browser-side SQLite/MBTiles adapter.

Offline packs must also have explicit region selection, versioning, integrity checks, storage quotas, update/rollback behavior, and device testing. Until that is built and verified, the UI must not claim that national packs or offline navigation are active.

## Source roles

| Source | Initial AFAT use | What it does not prove |
|---|---|---|
| OpenStreetMap | Base roads, names, and mapped features | Current passability, lawful access, or safe pickup |
| Overture Maps | Standardized place and transportation candidates with stable source IDs | AFAT verification or local entrance knowledge |
| Foursquare OS Places | Business and place candidates | Current operation, exact entrance, or public visibility |
| AFAT evidence | Local aliases, entrances, access observations, and outcomes | Truth until provenance, corroboration, and review are sufficient |

## Required before production rollout

1. Apply the migration in a staging Supabase project and inspect grants and RLS.
2. Configure Founder/staff roles and AAL2 before allowing import or review.
3. Record the exact dataset release, licence snapshot, checksum, and bounding box.
4. Run dry-run import, inspect counts, then use a small applied batch.
5. Review a sample against field or independent evidence.
6. Confirm public search never exposes private Place Cards or unreviewed candidates.
7. Monitor import failures and preserve rejected candidates for provenance.
8. Deploy the API and dashboard only after backend, frontend, SQL, and access-foundation checks pass.

This foundation is intentionally conservative: Overture, OSM, and Foursquare help AFAT find candidates; AFAT's durable value comes from verified local access, meeting, passage, and outcome evidence.
