# AFAT routing privacy and cutover reality

AFAT passengers use AFAT's own application/API, not public OSRM/Valhalla clients. That does **not** make the underlying provider endpoint private on its own.

## Verified deployed inventory, 24 October 2026

- `afat-cameroon-osrm`: Render **web_service**, Frankfurt, public subdomain **enabled**, inbound CIDR **0.0.0.0/0**, free plan.
- `afat-cameroon-foot-osrm`: Render **web_service**, Frankfurt, public subdomain **enabled**, inbound CIDR **0.0.0.0/0**, free plan.
- AFAT backend `asteck-bot`: Render **web_service**, Oregon. The current region separation means Render's same-network private DNS is **not** automatically available between it and Frankfurt.
- Optional Valhalla: not provisioned; its local Compose port is loopback only. Backend private-only URL acceptance is enforced for this provider, and activation remains disabled without `AFAT_VALHALLA_ENABLED=true`.

**Truth:** Existing driving/pedestrian OSRM are AFAT-controlled deployed route engines but presently externally reachable. No claim of full private-routing operation is justified. The new Valhalla code enforces a private host boundary by default, but a host suffix convention alone is not proof of effective network ACLs; deployment and direct-route denial checks remain necessary.

## Safe infrastructure transition (without passenger downtime)

1. Keep existing functioning OSRM routing while a private replacement or authenticated ingress is brought online. Do not blindly remove public URLs in production.
2. Deploy verified immutable Cameroon car/foot graphs behind internal-only endpoints in the backend's region/workspace, or move the backend/graphs into one authorized private network. Confirm host-level access policy and actual region. Provisioning new paid private services requires explicit resource/cost authorization.
3. Validate backend-to-private-car AND backend-to-private-foot route geometry, plus Yaoundé/Douala p95 and field accessibility. Test that unauthenticated direct external requests to graph endpoints are **blocked**.
4. Cut over `AFAT_OSRM_BASE_URL`, `AFAT_OSRM_FOOT_BASE_URL`, `AFAT_ALLOW_PRIVATE_OSRM_HTTP` only after both pass. Re-run existing Cameroon navigation acceptance and passenger fallback tests. Roll back on failure.
5. Disable or retire the original public OSRM services only after verified cutover. If using authenticated HTTPS ingress instead, put authentication in front of graph engine and explicitly configure the AFAT backend client to present the credential; a secret merely stored as an env var without enforcement is not access control.
6. Deploy optional Valhalla only when the Cameroon PBF tiles have been built from AFAT's verified source, memory and provider costs are approved, and the engine is reachable solely within the private network. Test road/vehicle legality and device GPS independently.

Do not confuse Cloudflare/Render deployment readiness, source control ownership or OSM licence rights with private service connectivity or field-verified navigation.

## Code-enforced private OSRM cutover gate

The backend now supports the opt-in `AFAT_REQUIRE_PRIVATE_OSRM=true` guard. When enabled, driving and pedestrian OSRM URL validation accepts only local loopback or private single-label Render-network names, rejects arbitrary external HTTPS origins, and disables public OSRM demo and Google Directions fallbacks for routing. It still **does not authenticate** an upstream endpoint or prove firewall isolation, and single-label private DNS must actually resolve only in the authorized network.

**This flag is intentionally NOT enabled on the current Oregon backend.** Its current Cameroon car/foot routing engines are public web services in Frankfurt and cannot be assumed reachable via Render internal DNS from Oregon. First provision/authorize actual private routing endpoints or move the backend and routing engines into a proven same-network environment, verify both with real geometry and access-denial tests, then enable the flag and cut over as a single controlled release. Do not break the existing passenger navigation prematurely.
