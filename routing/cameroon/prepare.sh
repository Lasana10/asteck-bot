#!/usr/bin/env bash
# Prepare an AFAT-owned Cameroon car-routing graph from Geofabrik OSM data.
# Needs Docker, curl, md5sum and sufficient host RAM/disk. No live service is changed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${AFAT_OSRM_DATA_DIR:-${ROOT}/data}"
IMAGE="ghcr.io/project-osrm/osrm-backend:v5.27.1"
PROFILE="${AFAT_OSRM_PROFILE:-car}"
if [[ "${PROFILE}" != "car" && "${PROFILE}" != "foot" ]]; then echo "Unsupported AFAT OSRM profile" >&2; exit 2; fi
EXTRACT="https://download.geofabrik.de/africa/cameroon-latest.osm.pbf"
mkdir -p "${DATA_DIR}"
cd "${DATA_DIR}"
echo "Downloading Cameroon OpenStreetMap extract; attribution: © OpenStreetMap contributors (ODbL 1.0)."
curl --fail --location --retry 3 --max-time 7200 -o cameroon-latest.osm.pbf.tmp "${EXTRACT}"
curl --fail --location --retry 3 --max-time 180 -o cameroon-latest.osm.pbf.md5 "${EXTRACT}.md5"
EXPECTED="$(grep -Eo '[[:xdigit:]]{32}' cameroon-latest.osm.pbf.md5 | head -n 1 | tr '[:upper:]' '[:lower:]')"
ACTUAL="$(md5sum cameroon-latest.osm.pbf.tmp | awk '{print $1}')"
if [[ -z "${EXPECTED}" || "${EXPECTED}" != "${ACTUAL}" ]]; then
  echo 'OSM checksum mismatch. Refusing to build an unverified road graph.' >&2
  exit 1
fi
mv -f cameroon-latest.osm.pbf.tmp cameroon-latest.osm.pbf
echo "Extract MD5 verified: ${ACTUAL}"
docker pull "${IMAGE}"
docker run --rm -v "${PWD}:/data" "${IMAGE}" osrm-extract -p "/opt/${PROFILE}.lua" /data/cameroon-latest.osm.pbf
docker run --rm -v "${PWD}:/data" "${IMAGE}" osrm-partition /data/cameroon-latest.osrm
docker run --rm -v "${PWD}:/data" "${IMAGE}" osrm-customize /data/cameroon-latest.osrm
if [[ ! -s cameroon-latest.osrm.partition || ! -s cameroon-latest.osrm.cells ]]; then
  echo 'OSRM MLD graph artifacts missing. Refusing to report a completed build.' >&2
  exit 1
fi
printf 'source=%s\nmd5=%s\nimage=%s\nprofile=%s\nbuilt_utc=%s\n' "${EXTRACT}" "${ACTUAL}" "${IMAGE}" "${PROFILE}" "$(date -u +%FT%TZ)" > graph-provenance.txt
echo 'Graph prepared. Start local OSRM and execute verify.mjs against real Yaounde/Douala routes before production activation.'
