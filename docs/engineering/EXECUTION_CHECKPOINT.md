# AFAT execution checkpoint — 2026-10-19

## Scope and continuity
## Standing mandate: two inseparable completion tracks

**A — AFAT product completion:** Build and verify complete connected Find → Understand → Reach → Book (optional) → Move → Learn journeys. Maintain commuter, driver, operator, fleet, school, city, community, safety, finance and shared intelligence roles. Begin with actual Cameroon field conditions and low-bandwidth/offline needs.

**B — worldwide technology reuse, integration and surpass:** Find and legally reuse, fork, self-host, adapt, personalize, combine and improve world-class existing systems to build the best complete AFAT. Every adopted component needs license/terms confirmation, Cameroon coverage, cost and scaling model, integration evidence, testing, and explanation of what AFAT adds beyond it. Integrate genuine end-to-end capabilities, not names of providers or isolated stubs.

Technology families (maintain comprehensive scope): OSM/Overture/MapLibre/tiles/PostGIS/place datasets; routing engines OSRM/Valhalla/OTP and validated transit; offline mapping; spatial recognition and last-meter guidance, including appropriately licensed Niantic/Immersal/ARCore integrations and open CV/SLAM/VPS alternatives; traffic intelligence; Earth observation and flood-risk sources; fleet/tracking/dispatch; compliant payment orchestration; community evidence systems; AI-CORE. Proprietary products are integration candidates, not code or databases that can be freely copied.

Success requires working integrated functionality and reproducible acceptance evidence, not a design, dependency list, feature stub or commit alone. Do not silently reduce Track B to routing and geocoding.

Continue existing `Lasana10/asteck-bot` on branch `engineering/afat-routing-selfhost-first-20261019`. Preserve all existing user journeys and prior research. Do not restart or duplicate the project.

## Latest addition
- Standalone /api/navigation/route and /api/navigation/reverse-geocode endpoints implemented and mounted; route response includes actual provider and traffic_aware=false. Commits 242e5f6, 216692a, 382892d. Unverified by CI or deployment.

- Reverse geocoding supports AFAT_REVERSE_GEOCODE_URL and avoids public Nominatim in production unless explicitly opted in (866f7b3).

## Completed in this branch
- Existing `src/services/directions.ts` updated to prefer configurable AFAT OSRM endpoint.
- Google Directions usage made explicit opt-in; public OSRM demo disabled by default in production.
- Invalid coordinate rejection, 10-second OSRM timeout and safe null on provider failure.
- Regression script `scripts/verify-routing-provider.mjs`, package script `npm run test:routing`, and AFAT CI step added.
- Self-hosting rollout guidance in `docs/engineering/self-hosted-routing-configuration.md`.

## Verification truth
GitHub commits verified. CI run #415 queued, not passed. CI execution, TypeScript build, tests, real routing engine, production rollout and end-to-end journey **not yet verified**. Do not claim they are done.

## Exact next actions
1. Run AFAT CI on the PR, inspect errors, fix failures until green. Check that the test mocks axios correctly in the runtime.
2. Check provider config in existing deployment without exposing secrets. Set AFAT_OSRM_BASE_URL only when a working endpoint is available; do not create paid infrastructure without approval.
3. Verify route UX behavior when routing is unavailable; test in Yaoundé and Douala with grounded routes and real data.
4. Merge only after CI and compatibility acceptance. Deploy through authorized existing deployment, then verify.
5. Continue connected mobility journeys and shared spatial intelligence, preferring permitted mature open-source implementations. Preserve other AFAT approved scope.

## Known blocker
No validated AFAT-operated OSRM instance or production credentials in this session. Do not substitute public demo traffic for production proof.
