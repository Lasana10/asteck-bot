# Optional immutable graph build for an isolated Render private service.
# This downloads and processes a whole-country extract during image build.
# Provisioning/compute cost and RAM MUST be reviewed before deploying.
FROM alpine:3.21 AS source
RUN apk add --no-cache curl ca-certificates
WORKDIR /data
RUN curl --fail --location --retry 3 --max-time 7200 -o cameroon-latest.osm.pbf https://download.geofabrik.de/africa/cameroon-latest.osm.pbf && \
    curl --fail --location --retry 3 --max-time 180 -o cameroon-latest.osm.pbf.md5 https://download.geofabrik.de/africa/cameroon-latest.osm.pbf.md5 && \
    EXPECTED="$(grep -Eo '[[:xdigit:]]{32}' cameroon-latest.osm.pbf.md5 | head -n 1 | tr '[:upper:]' '[:lower:]')" && \
    ACTUAL="$(md5sum cameroon-latest.osm.pbf | awk '{print $1}')" && \
    test -n "$EXPECTED" && test "$EXPECTED" = "$ACTUAL"
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1 AS graph
COPY --from=source /data/cameroon-latest.osm.pbf /data/cameroon-latest.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/cameroon-latest.osm.pbf && \
    osrm-partition /data/cameroon-latest.osrm && \
    osrm-customize /data/cameroon-latest.osrm && \
    test -s /data/cameroon-latest.osrm.partition && \
    test -s /data/cameroon-latest.osrm.cells && \
    rm -f /data/cameroon-latest.osm.pbf
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1
COPY --from=graph /data/ /data/
EXPOSE 5000
CMD ["osrm-routed","--algorithm","mld","--ip","0.0.0.0","--port","5000","/data/cameroon-latest.osrm"]
