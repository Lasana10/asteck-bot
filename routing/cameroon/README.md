# AFAT Cameroon self-hosted road routing

This is executable infrastructure for AFAT's existing `DirectionsService` (not an online route guarantee). The same backend is already integrated with the dashboard's canonical-first car route path.

## Proven technology and rights
- Graph source: [Geofabrik Cameroon PBF](https://download.geofabrik.de/africa/cameroon.html), derived from OpenStreetMap.
- Engine: [Project OSRM](https://github.com/Project-OSRM/osrm-backend), MLD pipeline, pinned container `v5.27.1`.
- OSM is available under [ODbL 1.0](https://www.openstreetmap.org/copyright). Public route/map experiences must provide clear OpenStreetMap attribution, and database modifications/distribution need separate ODbL compliance review.
- Driving profile only. OSRM does not infer live congestion, road safety, visual anchors, verified accessibility or public/minibus transit.

## Local/on-VPS graph preparation (no billed API required)
Requirements: Linux x86_64, Docker, curl, md5sum, several GB disk, sufficient free RAM for a Cameroon-sized graph. Preprocessing and storage resource use must be measured; do not assume a free Render instance can build/run this.

```bash
bash routing/cameroon/prepare.sh
docker compose -f routing/cameroon/docker-compose.yml up -d
node routing/cameroon/verify.mjs
```

The download includes a Geofabrik MD5 verification step. Graph compilation uses OSRM extract → partition → customize and refuses to report a successful build if required files are missing. OSM roads are still not AFAT-verified road passability.

The smoke script checks real route geometry, nonzero durations and distances in **both Yaoundé and Douala**. These test points are acceptance probes, not asserted verified existing routes. A failed smoke must block cutover, not be bypassed with fabricated geometry.

## Render private-service option (not provisioned)
- Example private service config: `routing/cameroon/render-private-example.yaml`.
- Dockerfile builds a country graph into a service image. **Build memory, storage, image size, region and billable private-service cost must be approved and measured before provisioning.**
- Existing AFAT backend Render service is in **Oregon**. Private OSRM must reside in the same workspace and region to use Render's internal DNS.
- Copy the private service's actual internal address from Render's Connect panel. Configure the existing AFAT backend:
  `AFAT_OSRM_BASE_URL=http://<actual-render-internal-host>:5000`
  `AFAT_ALLOW_PRIVATE_OSRM_HTTP=true`.
- The backend accepts plaintext HTTP only for explicit single-label internal-service hostnames, never arbitrary Internet endpoints or instance IPs. HTTPS remains an alternative where appropriate.
- Leave `AFAT_ALLOW_PUBLIC_PAID_ROUTING=false` by default. No automatic Google fallback for unauthenticated public requests.
- Do not enable any production cutover until the private service passes the real route smoke, API contract and mobile journey acceptance.

## Future work and acceptance
Run high-coverage OSM checks, benchmarks (p95 latency and memory), retry and recovery verification, rate limits, real-world Yaoundé/Douala field tests. Then add mode-appropriate Valhalla/OTP transit engines and verified informal transport feeds. Routing must not depend on booking.

This infrastructure is deployed only after explicitly provisioning a routing service. Committing these files and deploying the backend alone **does not create a routing service**.
