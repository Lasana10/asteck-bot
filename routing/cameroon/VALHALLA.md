# AFAT complementary Cameroon Valhalla runtime

Reuse the SAME MD5-verified Geofabrik Cameroon OSM extract prepared with `routing/cameroon/prepare.sh` for OSRM. It is under ODbL, with OpenStreetMap attribution required.

Local/evaluation-only: `bash routing/cameroon/start-valhalla.sh`, then after tiles are compiled run `node --import tsx routing/cameroon/verify-valhalla.mjs`. The latter calls real Yaoundé and Douala bicycle/motorcycle routes, fails if no valid geometry/duration is returned and writes no production records.

The scripted image documents `use_tiles_ignore_pbf=True` as its **default**. To avoid accidentally selecting a pre-existing tile archive instead of the checksum-verified Cameroon PBF, our Compose trial sets `use_tiles_ignore_pbf=False` explicitly. The startup preflight and regression test enforce this selection. A successful syntax check is not an accepted graph or route.

Official [Valhalla scripted Docker image](https://github.com/valhalla/valhalla/blob/master/docker/README.md) reuses the existing PBF through a local volume. The service binds localhost:8002 and does not offer a public unauthenticated routing API. Leave `build_transit=False` until authorized genuine GTFS feeds exist.

This local trial may require >4GB RAM, disk space and time to build. Do NOT assume free Render instances support this. The `latest` evaluation image must be pinned to a verified digest before production use. No external infrastructure has been provisioned.

After a real route benchmark and authorized service provisioning, configure AFAT backend `AFAT_VALHALLA_ENABLED=true` and `AFAT_VALHALLA_BASE_URL` with the actual authorized HTTPS or same-network private service hostname. For private HTTP only, explicitly set `AFAT_ALLOW_PRIVATE_VALHALLA_HTTP=true`. An app backend on Render cannot reach your local loopback address.

Always preserve existing OSRM car/foot and Atlas routing. Routes are not safety verification, live traffic, licensed transit supply, GTFS service, or confirmed passenger transport. Benchmark geometry, p95 time, memory, legal mode tags, field entrance and GNSS evidence prior to acceptance.
