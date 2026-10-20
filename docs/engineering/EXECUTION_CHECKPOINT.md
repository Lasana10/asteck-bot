# Continuation — 2026-10-20 Cameroon OSRM own road routing infrastructure (CI pending)

- Branch `engineering/afat-cameroon-osrm-private-routing-20261020`. Added `routing/cameroon/` graph-preparation script, checksum verification, Docker Compose driving engine, optional private Render Dockerfile, no-cost auto-provisioning policy and live city smoke script. Geofabrik OSM/ODbL and pinned OSRM v5.27.1 identified and incorporated.
- `DirectionsService` configured for opt-in Render private HTTP single-label routing hostnames; arbitrary public HTTP remains forbidden. Strict provider distance/duration/geometry validation prevents fake routing data. Added backend tests and CI static operator checks.
- Explicit operational blocker: **the actual isolated Cameroon OSRM service has not been provisioned, downloaded, built or field-tested**. No installed real routing network or user journey completion is inferred from source code. Render backend deployment is distinct from an OSRM deployment. No billable service created.
- Next exact continuation: obtain user-approved compute service/capacity within existing or new infrastructure; execute real Cameroon graph build and Yaoundé/Douala smoke; set backend private endpoint, deploy, verify frontend and end-to-end route. Additionally advance real-world VPS/vision proof and secure server-side observation validation.

# Update — 2026-10-20 spatial observation integration extended

- `AtlasContributionPanel` now gates GPS samples before live ingestion or offline enqueue; `FieldMapper` also gates field evidence before offline persistence. Both use the same evidence-aware positioning validator. Existing queue items and server-side direct submissions still require independent server validation; no claim of universal end-to-end trust.
- CI runs on successive branch updates; only the final head SHA should be accepted. Final CI/merge/deployment not yet verified.
- Next: backend ingestion validation and field/device acceptance, then integrate real visual-anchor observations and map uncertainty rendering that does not pretend to be 3D/VPS. Routing network coverage remains separate unresolved dependency.

# 2026-10-20 — spatial evidence integrity implementation (pending CI)

- Branch: `engineering/afat-spatial-position-integrity-20261020`. Added `dashboard/src/services/spatialPositioning.ts` with GNSS coordinate/accuracy/timestamp validation, stale/out-of-order and implausible-motion rejection, explicit uncertainty and confidence; added regression tests.
- Integrated this into `LivingAtlasMap` real `afat:contribution-sample` event path emitted by `AtlasContributionPanel` (includes `recordedAt` and `accuracyM`); rejected samples do not extend the displayed trace, and the map shows uncertainty and rejection feedback. This applies to the *map display trace*, not yet upstream persistence/validation.
- No VPS, indoor tracking, visual SLAM, field accuracy or real-route success claimed. Tests, merge and backend deployment require separate verified checks.
- Next dependency-ready implementation: perform positioning validation **before** Atlas sample persistence/queueing (currently the map display rejects after sample ingestion), with rejection telemetry and feedback; add device/integration acceptance. Then connect documented visual-anchor observation models and evidence-based fusion without pretending GNSS is visual positioning. Also resolve full Cameroon road graph and available OSRM operations.

# Latest verified execution state — 19 October 2026

- **Merged #112:** `fd302b708b026163daf971f81aa4ff0e4a002ffa`. GitHub Actions run `39325306356` backend and dashboard succeeded; Render backend deployment `dep-dbb8eocs728c73cfeeq0` reached **LIVE** for this commit.
- **Merged #113:** `3af93c5ab59d8995a61ff89f775041cb8e5d748e`. GitHub Actions run `39326483792` backend and dashboard succeeded; adds offline saved road-seed rendering, explicit limitation labels, and public paid-routing cost control. Render new-commit deployment for this second merge **not yet verified** at time of writing; last observed Render live commit remains `fd302b7`.
- **Supabase** verified active project `rkijcxxryhfrqsgkwtbu` (TRAFFIC), direct link and safe access in `docs/engineering/AFAT_SUPABASE_PROJECT.md`.
- **Known operational gap:** live `afat_route_canonical` sample Yaoundé route returned no shared connected component. No fully tested Cameroon road routing, complete offline navigation or production spatial VPS is claimed.
- **Next exact action:** check Render `srv-d6a66tggjchc73dot60g` for deployment of latest master (including docs-only checkpoint update), confirm frontend on Cloudflare, test real authenticated Atlas → route → map → guidance flow with proper operating data. Continue both AFAT completion and mature global technology reuse/improvement mandates, without restarting earlier blocks.
- **No credentials in the repo.** Use connected Supabase/Render tools with authorized access in future sessions.

## Same continuation — public routing quota protection
- Merged release remains `fd302b7`, backend deployed live via Render `dep-dbb8eocs728c73cfeeq0`.
- Follow-up PR #113 adds offline road-seed rendering **and** explicit cost guard: public `/api/navigation/route` never triggers Google metered fallback unless `AFAT_ALLOW_PUBLIC_PAID_ROUTING=true`; old internal routing remains available. Commits 55a5875, 5205e0b, cd6f2d6. This control prevents unauthenticated API calls from exhausting existing paid routing quota.
- Updated regression test and routing docs. Follow-up PR needs green CI, merge and deployment verification before accepted.
- Outstanding fundamental infrastructure: production-grade own OSRM/Valhalla service with verified network, plus non-mock offline vector/raster basemap and offline routing, and integrated broader AFAT workflows.

# Verified delivery checkpoint — 2026-10-19 22:13 Africa/Douala

- **Production release:** PR #112 merged to master as `fd302b708b026163daf971f81aa4ff0e4a002ffa` after GitHub Actions run `39325306356` passed backend and dashboard jobs. Existing Render backend service `srv-d6a66tggjchc73dot60g` auto-deployed this commit; deploy `dep-dbb8eocs728c73cfeeq0` reported **LIVE**.
- **AFAT Supabase project** `rkijcxxryhfrqsgkwtbu`, independently verified through connected Supabase, preserved in `docs/engineering/AFAT_SUPABASE_PROJECT.md`. Secrets are not committed.
- **Live graph limitation:** canonical driving route between sample Yaoundé points returned `no_shared_connected_component_within_snap_radius`. No acceptance of that journey.
- **Next block in this branch:** augment existing LivingAtlasMap with actual saved road-seed geometry when offline; parser and tests committed. This does **not** provide offline turn-by-turn routing or offline basemap tiles, and must not be presented as such.
- **Remaining core work:** trusted city-scale graph coverage, actual OSRM/Valhalla instance with verified Cameroon road data and licensing, connected multimodal navigation and execution, complete spatial positioning beyond basic map tiles, safe fleet/booking/payment integrations, offline tiles/route graph and real-device acceptance. Two master mandates below remain active.

## 2026-10-19 evening — live Supabase and offline map integration
- Connected Supabase TRAFFIC verified ACTIVE_HEALTHY; ref `rkijcxxryhfrqsgkwtbu`, link and safe continuation instructions committed `docs/engineering/AFAT_SUPABASE_PROJECT.md` (e784473). No credentials in repository. Connector access is account-dependent.
- Live SQL verified functions `afat_route_canonical`, `afat_offline_city_pack`, `afat_atlas_nearby`. Existing counts: 839 Atlas nodes, 878 edges, 8756 geographic source records, 771 places. Actual test route 3.866,11.516→3.875,11.526 in car mode returned **unavailable** (`no_shared_connected_component_within_snap_radius`). Not a successful network test.
- Inspected live `afat_offline_city_pack` function definition; verified stable keys for places, access points, transit nodes and lines; direct unauthenticated SQL invocation correctly rejected with `Authentication required`.
- Commit 1317f06: Live `LivingAtlasMap` now uses `Promise.allSettled` and draws saved city places/access/transit nodes when relevant live RPCs fail; visibly flags offline city knowledge and unavailable live traffic. Cached transit lines have no sequence geometry in current server output; do not claim offline line navigation. Online raster tiles are still required for background and offline route graph is not built.
- GitHub Actions remains queued. No passing builds, merge, or deployment demonstrated. Local git clone from container fails DNS resolution, so use connected tools or an authorized runner to run tests.

**Next implementation**: tests for disconnected map knowledge rendering and the offline-pack response adapter; verify MapLibre client error presentation; route network topology improvements backed by verified imported data, not fabricated connectivity. Continue provider-independent geospatial, fleet and multimodal capability work within both master tracks.

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


## Verified execution 2026-10-20 — field evidence intake closed-loop safeguards
- PR #116 merged as d889dfb9: deterministic contributor-scoped photo paths; GNSS/observation validation; account-scoped serialized IndexedDB offline replay; queue status restored on app startup; regression tests. Both CI jobs passed.
- PR #117 merged as 4fde510: production storage policies confirmed owner INSERT + SELECT without UPDATE; removed incompatible storage upsert, using stable immutable uploads and exact-object conflict checks. Both CI jobs passed. Render deploy dep-dbbkpkqvcj2c739v68q0 verified LIVE.
- PR #118 merged as 229f90e: contributor-scoped unique client observation identifier and privileged RPC replay protection; malformed early migration draft repaired before merge. Both CI jobs passed (master run 39414678766). Applied to TRAFFIC Supabase project rkijcxxryhfrqsgkwtbu (success); confirmed unique index and RPC idempotent_replay branch installed; existing production mapping observations remained zero.
- Existing disconnected-component snapping fix from historical PR #65 is ALREADY deployed in public.afat_route_canonical_base and wrapped by public.afat_route_canonical for ETA enrichment. Do NOT replace wrapper with old PR #65 or repeat the same feature. Geographic coverage still insufficient for some real routes.
- Field RPC replay is database-protected, but full authenticated test-user retry, real-device IndexedDB/photo sync, Cloudflare frontend deployment, and field-grounded observations are NOT accepted. Do not claim complete offline mapping.
- Next high-impact dependency-ready work: operationally verify signed-in field mapper on a safe isolated account/device, then connect reviewed entrance/informal-stop/road evidence into Find → Understand → Reach and routing freshness; additionally integrate mature geospatial datasets legally for greater Cameroon topology and multimodal coverage. Avoid another repeat of already installed component-snapping logic. Preserve entire AFAT spatial/VPS/3D/Earth observation/AI-CORE/mobile/operator/safety mandate.

- PR #119 merged as 59c044a44f5a: Atlas micro-mission UI no longer treats obtaining GPS as confirmation that a road is open. Contributor must enter an on-site observation; road passability is optional and explicitly selected, quality-checked GNSS required, and the deployed RPC inserts Atlas field_verification only when an explicit condition exists. Both CI jobs passed (run 39415175134). Real-device and field-truth acceptance remain open.
- Next independently useful integration: replace target-edge mission outcome vocabulary with an explicit, reviewed schema enforced in database, then verify mission → trusted evidence → Atlas graph update → Find/Reach using an isolated authenticated field test. In parallel prioritize source-licensed full Cameroon OSM/Overture graph and transit data build, self-hosted routing connectivity, and spatial/VPS/3D technology gate. Do not redo deployed shared-component snapping or field mapper idempotency.

- PR #120 merged as 06e7640f: authenticated reviewed-Atlas → shared AI-CORE spatial interpretation API and dashboard Atlas context. Uses only corroborated/verified Atlas evidence, bounded user-selectable public questions (no raw personal prompt to AI), evidence references, explicit insufficiency and AI unavailable outcomes, and advisory-only disclosure; Vitest contract checks and backend compile CI passed (run 39415908179). Runtime model availability and frontend Cloudflare deployment NOT yet accepted; no GPS/VPS/hazard/route inference claimed.
- Next exact execution state: check Render LIVE on merged API commit 06e7640f; verify health/contract includes POST /api/atlas/explain and authenticated runtime against an isolated eligible test user; establish AI_CORE_URL and AFAT key configuration without viewing or reporting secrets; connect field-reviewed place media/entrances to geographic candidate evidence for visual landmark interpretation, with provenance and consent before any visual positioning; execute city real-data OSRM infrastructure only after cost/capacity sign-off. Continue wider mobility, fleet, safety, satellite, 3D and multimodal integration in parallel; do not mistake grounded text interpretation for visual VPS.


## 2026-10-20 — AI-CORE reviewed evidence boundary follow-up (PR #121 pending)
- Render backend `srv-d6a66tggjchc73dot60g` deployment `dep-dbbl4j1htm6c73alg4q0` confirmed LIVE for master `31c1e812`; authenticated /api/atlas/explain AI model success is NOT verified.
- PR #121 adds strict reviewed-evidence identifier/confidence validation, control-character normalization and repeatable `npm run test:atlas-ai-evidence` assertions; no live database mutation or paid service created. CI for branch head `3ada7bbaea704bff42b3583fbffeda640824452a` initially queued; no pass/merge/deploy claimed.
- Next: run explicit evidence boundary test, require green backend/dashboard checks before merge; verify authenticated cross-service AI-CORE interaction on safe real test account, check Cloudflare frontend separately. Do not treat LIVE Render status as successful model inference. Continue connected field evidence / entrance work and Cameroon real routing once capacity approved.


## 2026-10-20 continuation — verified AFAT AI boundary release and Find→Reach truth
- PR #121 merged as `260dff95ab36bc0ece081f3dae8df9ced444dc0f` after backend and dashboard CI passed on head `6439c2a211edbc7eb15e329838fb29e6e8625e83` (Actions `39417899520`). Render auto-deploy `dep-dbblbtpsrm7s738c07n0` observed `build_in_progress`; LIVE for this commit not yet established when recorded.
- PR #122 (branch `engineering/afat-find-reach-connected-readiness-20261020`) removes a false route-ready claim based only on nearby reviewed Atlas road evidence. Nearby roads do not demonstrate a connected usable path. CI, merge and frontend deployment remain unverified.
- Next exact work: finish PR #122 CI, merge/release, verify Render #121 LIVE, then test authenticated POST /api/atlas/explain with an isolated eligible test session and confirm AI-CORE response; confirm Cloudflare dashboard separately. Connect actual route readiness to a validated origin→destination routing result rather than geographic proximity, and continue reviewed entrance/access evidence through client/backend/field flow. Cameroon OSRM remains dependent on capacity and real data validation.

## 2026-10-20 — offline mobility evidence custody integration (PR #123)
- Verified Render deployment `dep-dbbldb9srm7s738c23bg` LIVE at merged PR #122 commit `4331949dd5b59a19fa8f4560dd627b4cdcbf3f3d`; this is backend service deployment only, not Cloudflare dashboard or authenticated AI model acceptance.
- PR #123 implements separately persisted, account-scoped offline access/entrance, informal transit and mobility-gap evidence; protected contributor-specific replay with online identity confirmation; local signed-in session capture offline; queue capacity enforcement; no automatic promotion to road/place truth. Historical unowned queue is deliberately not replayed to protect privacy. Adds Vitest isolation and replay regression cases.
- Release truth: PR #123 is OPEN pending final-head backend/dashboard CI, merge and frontend deployment. No real-device or production observation claims.
- Next exact executable step: finalize PR #123 CI, fix tests/type errors; merge after green; verify Cloudflare deploy independently, perform account-switch + offline device acceptance with safe isolated users; add backend replay idempotency for each mobility evidence RPC (same uncertainty remains for requests interrupted after a successful server commit). Then authenticate AFAT → AI-CORE using eligible isolated test account and verify response provenance. Full Cameroon OSRM still requires actual compute/cost sign-off and city field routing acceptance.


## Verified 2026-10-20 — mobility offline evidence custody and exact server replay
- PR #123 merged `ed80a847cef24c05bf41b8362a43ca045d051850`: account-separated local evidence records, online authenticated replay, offline signed-in capture, and no replay of legacy unowned queue; backend/dashboard CI passed. Does not prove real-device sync or frontend Cloudflare deployment.
- PR #124 merged `a2de71d9470727cdd009199de3b3b357648bb186`: stable UUID for online and offline retry and database atomic receipt RPC for entrance, transit and mobility-gap submissions. Backend/dashboard CI passed. Production Supabase migration `afat_mobility_evidence_exact_replay` applied successfully to `rkijcxxryhfrqsgkwtbu`; SQL inspection confirmed receipt table exists, authenticated EXECUTE=true, authenticated receipt SELECT=false, records=0. Render deployment `dep-dbbljq6k1f9s73c0di60` verified LIVE on #124 merge.
- Operational acceptance still open: authenticated same-key retry with isolated eligible test user; account-switch and offline device replay; Cloudflare frontend deployment; full AFAT→AI-CORE authenticated result; verified Cameroon street graph/OSRM engine and complete journeys. Ledger proves structurally installed, not field-valid.
- Exact next executable: secure isolated end-to-end browser/device test for online-submit→lost-response→offline replay→same receipt, verify fresh Cloudflare artifact; independently confirm AFAT→AI-CORE configuration and eligible authenticated runtime request. Keep actual road topology and approved broader AFAT capabilities advancing in separate connected batches. No production synthetic submissions.

## 2026-10-20 live continuation — integrated field review, local discovery, real Cameroon OSRM
**Accepted merged code (all final-head backend/dashboard CI passed):**
- PR #125 `c800bb0a`: planner-reviewed entrances and informal transit evidence with current RLS/review RPC; PWA vendor chunk splitting.
- PR #126 `21a2c9b8`: reviewed Atlas/AI interface now mounted in actual Passage Planner, origin linked and provisional geographic evidence visibly separated.
- PR #127 `f4086687`: limited access proposals no longer alone certify high-confidence Reach. Migration `afat_reachability_reviewed_access_gate` APPLIED; live SQL confirmed strong reviewed-access gate.
- PRs #128/#129 `11206dc8`/`02efe105`: transit promoter now requires `map.evidence.review` or `system.configure`, not the read-only `planning.aggregate.view` permission. Initial migration failed due an escaped comment, corrected migration APPLIED. Live SQL confirmed restricted gate and no transit observation insertion.
- PR #130 `c2bc5b4a`: real Cameroon Geofabrik OSM/ODbL → pinned OSRM v5.27.1 graph built and tested on ephemeral GitHub runner `39449310910`: source MD5 `76274ae226f2a567942f3da07a031dbc`, Yaoundé 2171 m/177 s/92 geometry points, Douala 1034 m/152 s/41 points. No field accuracy or permanent routing service claimed.
- PR #131 `0fdd9146`: independent live production API no-write GitHub runner `39449732417` passed Render /health contract, anonymous POST explain/observations 401, public Atlas GET; request around 3.866,11.516 radius 1500 m returned 0 graph nodes/edges.
- PR #132 `4e3dd337`: OSRM MLD artifacts' hashes and byte counts corrected; full real route runner `39450317340` passed both city checks, artifact exists.
- PRs #134/#135 `9fe4e27f`/`68bf9fce`: real licensed Overture/OSM limited-evidence place candidates wired through PostGIS RPC, public Atlas backend, passenger UI and selection in current Find→Reach. First candidate RPC installed but read failed due unqualified PostGIS KNN operator; second migration `afat_atlas_place_distance_order_runtime` APPLIED and live verified: 20 results in 3-km Yaoundé probe, `anon`/ordinary `authenticated` cannot directly execute function and `service_role` can.
- PR #136 `f7e92236`: external live API read-only test `39453216779` passed, proving 20 actual nearby source-licensed candidates, no private fields, explicit `verified_access:false`, public explanation/observation POST still 401.

**Real-world truth:** 839 provisional Atlas nodes, ~771 limited-evidence places, no independently reviewed access points or submitted field entrance/transit observations at last live SQL check. AI-CORE service presence does NOT mean authenticated grounded interpretation is accepted; no successful model request proven. This is not a full Cameroon routing network or full offline visual-navigation acceptance.

**Current unmerged dependency:** PR #133 `engineering/afat-deployment-ready-osrm-oci-20261020` packages actual graph to portable OCI with GHCR master-only publication. Base compiled graph/city smoke passed, but prebuilt image container failed due `cameroon-latest.osrm.fileIndex` being 69 MB on runner source versus 0 B after Docker COPY. Current branch materializes dense file via `cp --sparse=never`, guards fileIndex size at image build, and must pass full real-graph + packaged-image two-city acceptance BEFORE merge/publish. No GHCR image or persistent OSRM deployment should be claimed until independently verified. GHCR production push should happen only after merged validated master.
**Unfinished operational acceptance:** confirm latest Render LIVE commit, Cloudflare dashboard live build, eligible signed-in AI-CORE response, independent field-device exact replay, reviewed real entrance/transit promotion, real Cameroon routing host provisioned only with known approved capacity, offline routing tiles, multimodal, visual VPS/SLAM/3D and emergency/fleet systems.
**Exact next action:** finish PR #133 final-head real OSRM OCI runner and fix any remaining fileIndex copy failure; merge only after both CI and real image route smoke pass, verify GHCR publish. Then verify latest Render and Cloudflare separately; run authenticated field/AI test with eligible isolated account without touching production user data.

## 2026-10-20 — connected offline passenger route restoration (PR #140)
- PR #139 merged `26010ecb0aa5c9a2f12cd5b278007eaad679c571` after green CI: external OSRM/Google geometry is explicitly provisional, baseline ETA is not presented as an observed ETA, and passenger ranking no longer marks external routes strong evidence.
- PR #140 branch `engineering/afat-offline-navigation-resume-20261020` closes a substantive passenger continuity failure. The prior Resume button did an online search and ran a destination-selection handler that reset the navigation state. Now valid connected route geometry is captured at real navigation start into a 48h, bounded, account-matched local record; offline resume recovers destination, geometry, mode, prior navigation session, and labels stale last GPS as not current. Offline reroute keeps existing geometry instead of discarding it. Local navigation begins immediately without blocking on network intent submission. Account mismatch, expired/corrupt route, arrival and cancellation are handled fail-closed. A dedicated Vitest suite validates geometry, account boundaries, expiry and rejection. These changes require final-head CI, merge and frontend Cloudflare release verification.
- **Not accepted:** real-device background/offline location guidance, cached map tiles, authenticated production sync replay, published paid/available OSRM host, spatial positioning/AR/VPS, AI-CORE verified response. A route record is not verified safety, traffic, or physical entrance evidence.
- **Next exact executable:** require CI on PR #140 final head; correct any build/test errors and merge; verify Cloudflare live passenger artifact; run a real browser/device offline/online trip replay and backend session sample sync. If external hosting workspace cannot be chosen safely, independently advance geographically grounded multimodal and spatial integrations rather than repeating Render setup.

## 2026-10-20 — Connected offline Find → Navigate → Resume release
- PR #139 merged `26010ecb0aa5c9a2f12cd5b278007eaad679c571` after green CI; passenger labels now distinguish actual OSRM/Google external road-network baseline duration from AFAT observed ETA and verified network evidence.
- PR #140 merged `54a82fe15160f7a0e2c429c544732e0771d707d8` after backend/dashboard CI passed: passenger Start Navigation no longer blocks on an online intent RPC, actual route geometry is bounded and saved per account for 48h, saved destination and navigation session can be restored offline, malformed/expired/cross-account routes are refused, existing road geometry remains available when offline, and route snapshot is cleared at arrival/cancellation. Unit tests enforce account boundaries and geometry correctness.
- PR #141 merged `c41776534b95e61866b5668211d51e52914bc62d` after backend/dashboard CI passed on head `99b29fac7466561fed492362a1d2a7d11b98451d`: offline Find searches actual spatial-viewport cached places with city/expiry controls; offline place selection does not depend on online geocoding or fabricate entrances; a no-tile schematic drawn from actual preserved route geometry remains visible without network, with distance-aware progress and offline provenance rather than invented map tiles. Cloudflare deployed-bundle acceptance workflow `39475410038` started; actual live frontend verification must be checked separately.
- **Status distinction:** integrated code is tested/merged; not yet real-device/field validated. Offline basemap raster tiles are intentionally not claimed cached because third-party map licensing remains independent. Route schema and baseline duration are not hazard/traffic/entrance evidence. No new persistent Cameroon routing host provisioned; GHCR graph artifacts are not a running service.
- **Next exact work:** complete actual Cloudflare bundle probe and independently verify Render current release; exercise isolated signed-in passenger/device offline → reconnect → navigation sample/field observation replay without inserting synthetic production observations. After this acceptance, advance production-connected Cameroon OSRM service once the correct authorized Render workspace and capacity can be established, and continue multimodal transport, reviewed entrance, AI-CORE and advanced visual positioning workstreams in parallel.

## 2026-10-20 verified post-release offline passenger acceptance
- PR #140 `54a82fe1` and PR #141 `c4177653` are merged with passing backend and dashboard CI. They collectively deliver account-scoped, bounded offline route storage/restore, nonblocking local start, map-cache-powered offline destination search, a location-aware route schematic that requires no third-party raster tile, and honest offline navigation/ETA labels.
- External GitHub Actions read-only Cloudflare production verification `39475410038` finished SUCCESS. It detected stale Cloudflare JS four times, then loaded live `/assets/index-BkalduLr.js` (893054 bytes) and passed assertions for limited-evidence Atlas data, offline place search and restored journey text. **Deployed frontend verified**, not real-device or authenticated journey accepted.
- Next executable major work: real signed-in passenger acceptance with network drop/reconnect and completed Supabase navigation session and field evidence; integrate provider turn maneuvers through DirectionsService → canonical client → navigation UI and offline route without invented live road evidence. The attempted provider maneuver code update was not applied because the GitHub tool rejected that write; do not claim implementation.
- Genuine infrastructure dependency: Render workspace selection must be confirmed before altering paid/private services. Connected Render lists `My Workspace` (`tea-d1r4s1je5dus73e9ats0`), `AsTeck – DREEM` (`tea-da6690rtqb8s739o9vr0`) and `AsTeck – TSIDEK.` (`tea-da66a0bl550s738ig4q0`). Do not guess the correct workspace for AFAT's existing service `srv-d6a66tggjchc73dot60g`; keep deployed OSRM image vs persistent production endpoint clearly separate.
