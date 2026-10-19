# AFAT execution checkpoint — 2026-10-19

## Scope and continuity
Continue existing `Lasana10/asteck-bot` on branch `engineering/afat-routing-selfhost-first-20261019`. Preserve all existing user journeys and prior research. Do not restart or duplicate the project.

## Completed in this branch
- Existing `src/services/directions.ts` updated to prefer configurable AFAT OSRM endpoint.
- Google Directions usage made explicit opt-in; public OSRM demo disabled by default in production.
- Invalid coordinate rejection, 10-second OSRM timeout and safe null on provider failure.
- Regression script `scripts/verify-routing-provider.mjs`, package script `npm run test:routing`, and AFAT CI step added.
- Self-hosting rollout guidance in `docs/engineering/self-hosted-routing-configuration.md`.

## Verification truth
GitHub commits verified. CI execution, TypeScript build, tests, real routing engine, production rollout and end-to-end journey **not yet verified**. Do not claim they are done.

## Exact next actions
1. Run AFAT CI on the PR, inspect errors, fix failures until green. Check that the test mocks axios correctly in the runtime.
2. Check provider config in existing deployment without exposing secrets. Set AFAT_OSRM_BASE_URL only when a working endpoint is available; do not create paid infrastructure without approval.
3. Verify route UX behavior when routing is unavailable; test in Yaoundé and Douala with grounded routes and real data.
4. Merge only after CI and compatibility acceptance. Deploy through authorized existing deployment, then verify.
5. Continue connected mobility journeys and shared spatial intelligence, preferring permitted mature open-source implementations. Preserve other AFAT approved scope.

## Known blocker
No validated AFAT-operated OSRM instance or production credentials in this session. Do not substitute public demo traffic for production proof.
