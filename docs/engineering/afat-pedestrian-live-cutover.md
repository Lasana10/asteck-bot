# AFAT pedestrian routing: remaining production cutover

Current evidence: Cameroon foot graph was built, verified in Yaoundé and Douala, packaged and published in GHCR. **This is not evidence of an operational passenger endpoint.**

## Operator-controlled deployment (do not auto-create billable services)
1. Select the **confirmed** Render workspace that operates AFAT's existing backend. Render private DNS only works inside the same workspace and region (existing backend: Oregon).
2. Review plan cost, image size, memory and startup profile. Provision the dedicated private service using `routing/cameroon/render-foot-private-example.yaml` only after explicit cost approval. Its runtime Dockerfile pins the verified immutable walking graph digest; do not use the road engine.
3. Get the actual private DNS hostname from Render's Connect panel. Set backend `AFAT_OSRM_FOOT_BASE_URL=http://<actual-private-host>:5000` and `AFAT_ALLOW_PRIVATE_OSRM_HTTP=true`. Keep `AFAT_OSRM_BASE_URL` pointing to the existing driving service.
4. Deploy the backend only after the foot service is healthy. Public `GET /api/navigation/route?origin_lat=...&origin_lon=...&destination_lat=...&destination_lon=...&mode=foot` must return `travel_mode: foot`, `source: osrm`, real geometry, maneuvers, and snap distances. No fallback to driving geometry or metered Google is permitted.
5. For an externally reachable HTTPS foot endpoint, run `AFAT_FOOT_ROUTER_URL=https://<walking-endpoint> AFAT_API_URL=https://asteck-bot.onrender.com node scripts/verify-live-cameroon-walking.mjs`. Alternatively set repository variable `AFAT_FOOT_ROUTER_URL` and manually dispatch the dedicated GitHub Actions workflow. A private-only endpoint cannot be checked directly from GitHub-hosted runners; use a trusted same-workspace runner or a temporary authorized HTTPS gateway.
6. Validate passenger map interaction, accessibility and crossing limitations, failure behavior, latency, cost, and real Yaoundé/Douala journeys before declaring full passenger walking service operational.

Route estimates derive from OpenStreetMap/Geofabrik (ODbL); they do **not** certify safe crossings, sidewalks, entrances or wheelchair access.
