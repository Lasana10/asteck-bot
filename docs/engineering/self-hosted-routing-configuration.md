# AFAT self-hosted routing rollout

The existing DirectionsService now prefers OSRM and makes metered Google fallback explicit.

## Configuration
- `AFAT_OSRM_BASE_URL=https://routing.example.org`: AFAT-controlled OSRM route service. HTTPS required except localhost.
- `AFAT_GOOGLE_DIRECTIONS_FALLBACK=true`: explicitly permit metered Google Directions API if OSRM fails and `GOOGLE_MAPS_API_KEY` is present.
- `AFAT_ALLOW_PUBLIC_OSRM=true`: explicitly allow the public OSRM demonstration endpoint in production. **Not recommended**: no production SLA or capacity guarantee.

Without an AFAT routing endpoint and without explicit fallback, production returns no route rather than silently depending on a public demo or charging Google. This requires configuration before deployment. No new paid infrastructure is authorized by this change.

- `AFAT_ALLOW_PUBLIC_PAID_ROUTING=true`: explicitly authorize billable Google fallback for the public `/api/navigation/route` endpoint. Default false to prevent unauthenticated requests from spending quota. Treat enabling this as a cost/security decision, apply quotas and monitoring first. Internal legacy route calls may still use configured Google until AFAT OSRM is ready.

## Before production
1. Provision an OSRM instance and legal road extract; measure coverage and route quality in Yaoundé and Douala.
2. Confirm that the backend can reach the endpoint over TLS and apply network access controls.
3. Test valid and invalid coordinates, OSRM failure, alternative routes, timeouts, and paid fallback opt-in.
4. Confirm client handling of null route responses; monitor failures and request volume.
5. Verify production environment configuration, deploy through existing pipeline and run real journey acceptance tests.

## Scope
This is one infrastructure adaptation. It does not claim completion of AFAT mobility, spatial intelligence, fleet, dispatch, safety, payment or institutional journeys.
