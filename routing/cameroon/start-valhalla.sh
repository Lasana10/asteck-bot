#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA="${AFAT_OSRM_DATA_DIR:-${ROOT}/data}"
if [[ ! -s "${DATA}/cameroon-latest.osm.pbf" || ! -s "${DATA}/graph-provenance.txt" ]]; then
 echo "Verified Cameroon source missing. Run routing/cameroon/prepare.sh before building Valhalla." >&2; exit 1
fi
EXPECTED="$(awk -F= '$1=="md5"{print $2}' "${DATA}/graph-provenance.txt")"
ACTUAL="$(md5sum "${DATA}/cameroon-latest.osm.pbf" | awk '{print $1}')"
if [[ -z "${EXPECTED}" || "${EXPECTED}" != "${ACTUAL}" ]]; then
 echo "Refusing mismatched/modified Cameroon OSM source." >&2; exit 1
fi
echo "Verified Cameroon source. Building an optional LOCAL Valhalla routing graph; measure memory and disk."
if grep -Eq '^[[:space:]]*use_tiles_ignore_pbf:[[:space:]]*"?[Tt]rue"?' "${ROOT}/docker-compose.valhalla.yml"; then
 echo "Valhalla Compose would ignore the OSM PBF. Refusing a false graph build." >&2; exit 1
fi
docker compose -f "${ROOT}/docker-compose.valhalla.yml" up -d
echo "Once service tiles build and respond, run: node --import tsx routing/cameroon/verify-valhalla.mjs"
