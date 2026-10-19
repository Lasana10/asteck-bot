## Continuation 2026-10-19 — honest offline map installation
- e658f1f: changed MapOfflineService from URL-check plus localStorage flag into actual verified CacheStorage persistence. Added same-origin verification, GeoJSON checks, readOfflineAsset, rollback for failed installs, cache purge, and disabled synthetic national corridor pack posing as production-ready.
- 93a76c5 / d228269: reconcile stored offline pack flags against CacheStorage on startup and gate availability on verified assets.
- 5687c68: added Vitest coverage for misleading legacy flags, actual cached offline responses, and rejection of unverified Cameroon pack.
- 50c10ee: ensured initial cache reconciliation finishes before installation; fixes installation/reload race.
- **Not yet verified by executed tests or deployed.** Cached downloadable seed files are not a completed offline road navigation engine, and not all UI consumers are confirmed to retrieve these assets through CacheStorage. Do not claim complete offline mobility.
- **Next actual engineering:** Run dashboard test suite/CI; integrate readOfflineAsset into existing map data loader and verify disconnected map rendering, then implement validated graph routing from appropriately licensed full data instead of pretending demonstration roads support nation-wide journeys. Continue both approved product and technology reuse tracks.

## Continuation: external route evidence integrity
- Commit 674973c: dashboard rejects fallback routes without explicit osrm/google provenance, strictly positive numeric distance and duration, valid bounded GeoJSON lines. This prevents falsely successful routing from incomplete provider response objects.
- Commit f6297a9: regression test for missing provenance and fabricated zero-time routes added.
- Tests not claimed passing: GitHub Actions remained queued when last checked. Draft PR #112 intentionally not merged/deployed without quality gates.
- Exact next work: execute frontend/back-end test suites on available runners, correct test/build failures, verify real route and offline behavior; keep both approved AFAT product completion and global-technology integration tracks active.

# AFAT execution checkpoint — 2026-10-19

## Scope and continuity
## 2026-10-19 continuation — GPS integrity
- Committed route-guidance safety correction: missing/invalid GPS accuracy no longer appears high-confidence and cannot trigger autonomous rerouting; conservative route threshold applied. Commits 9d820d2 and 7640211.
- Committed GPS uncertainty integration regression tests in dashboard/src/services/routeGuidance.test.ts (867045b). Tests committed, **not yet executed/passed**.
- GitHub Actions jobs for previous changes remained queued; external container cannot resolve github.com, so local repository clone and CI execution unavailable. Do not infer passing tests, merged status, or live deployment.
- Next: run dashboard Vitest and backend test/build when a runner is available; fix errors; verify AFAT canonical → OSRM fallback → geometry → map progress on real Cameroon routes, preserve two-track vision and iterate on other dependency-ready workflows.

## Standing mandate: two inseparable completion tracks

**A — AFAT product completion:** Build and verify complete connected Find → Understand → Reach → Book (optional) → Move → Learn journeys. Maintain commuter, driver, operator, fleet, school, city, community, safety, finance and shared intelligence roles. Begin with actual Cameroon field conditions and low-bandwidth/offline needs.

**B — worldwide technology reuse, integration and surpass:** Find and legally reuse, fork, self-host, adapt, personalize, combine and improve world-class existing systems to build the best complete AFAT. Every adopted component needs license/terms confirmation, Cameroon coverage, cost and scaling model, integration evidence, testing, and explanation of what AFAT adds beyond it. Integrate genuine end-to-end capabilities, not names of providers or isolated stubs.

Technology families (maintain comprehensive scope): OSM/Overture/MapLibre/tiles/PostGIS/place datasets; routing engines OSRM/Valhalla/OTP and validated transit; offline mapping; spatial recognition and last-meter guidance, including appropriately licensed Niantic/Immersal/ARCore integrations and open CV/SLAM/VPS alternatives; traffic intelligence; Earth observation and flood-risk sources; fleet/tracking/dispatch; compliant payment orchestration; community evidence systems; AI-CORE. Proprietary products are integration candidates, not code or databases that can be freely copied.

Success requires working integrated functionality and reproducible acceptance evidence, not a design, dependency list, feature stub or commit alone. Do not silently reduce Track B to routing and geocoding.

Continue existing `Lasana10/asteck-bot` on branch `engineering/afat-routing-selfhost-first-20261019`. Preserve all existing user journeys and prior research. Do not restart or duplicate the project.

## Latest addition
- Google Directions opt-in fallback now decodes overview polyline to the same GeoJSON route geometry expected by the dashboard; commit df942d5. Not yet runtime-tested.

- Existing dashboard canonical route client now reuses backend road router for **car only** when verified AFAT graph lacks coverage, preserving atlas-first preference, real route line geometry, route provenance and unverified traffic/passability disclaimers. Commits 2996f53, 48559b3, 62a5e4b, 0751cc3.
- Added dashboard integration tests for canonical preference, route fallback geometry, incorrect travel-mode prevention and invalid data rejection; improved backend routing fixtures. Commits 7b54a54, 5739bd3. CI remains queued; **not yet passing or deployed**.

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
