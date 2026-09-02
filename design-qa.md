# AFAT role workspace design QA

## Comparison target

- Source visual truth:
  - `/workspace/scratch/af6d070aac2f/afat-approved-designs/AFAT Passenger Route to Mfoundi Market.png`
  - `/workspace/scratch/af6d070aac2f/afat-approved-designs/AFAT operator next mission dashboard.png`
  - `/workspace/scratch/af6d070aac2f/afat-approved-designs/AFAT Fleet Operations Control Center.png`
  - `/workspace/scratch/af6d070aac2f/afat-approved-designs/AFAT Planner: Resolve Movement Failures.png`
- Source pixels: mobile references 853 × 1844; desktop references 1487 × 1058.
- Intended CSS viewports: mobile 393 × 852 at density 1; desktop 1440 × 1024 at density 1.
- Implementation: production `https://asteck-bot.pages.dev/`, commit `ec7a8c32ba97b681b4756b190a49f536f1f5cf98`.
- Implementation screenshot path: unavailable; the cloud browser blocked `terminal.local:4173` with `ERR_BLOCKED_BY_CLIENT`, and production correctly requires an approved signed-in role before rendering these workspaces.
- State: production access screen verified; authenticated passenger, operator, organisation and planner states not captured.

## Full-view comparison evidence

Blocked. The source visuals were opened and inspected, but an equivalent authenticated browser-rendered workspace could not be captured. The public production access screen loaded successfully and the deployed JavaScript contains the new role workspace copy, but neither is a valid visual substitute for the authenticated target states.

## Focused-region comparison evidence

Blocked for the same reason. Code and build output were not treated as visual evidence.

## Findings

- [P1] Authenticated role screens still need production visual comparison.
  - Location: passenger, operator, organisation and planner home workspaces.
  - Evidence: source targets are available; equivalent browser screenshots are not.
  - Impact: typography, density, map proportions and above-the-fold hierarchy cannot be honestly certified against the approved images.
  - Fix: capture each role with an approved test identity at the target viewport, combine each capture with its source image, and repeat the comparison after any P1/P2 correction.

- [P2] Mobile density and persistent navigation need a 393 × 852 check.
  - Location: passenger and operator workspaces.
  - Evidence: the responsive code builds, but a normalized 1:1 mobile capture was unavailable.
  - Impact: long local-place labels or mission fields may wrap differently from the approved screens.
  - Fix: verify at 393 × 852 and adjust panel heights, type wrapping and bottom navigation clearance if required.

## Required fidelity surfaces

- Fonts and typography: implementation uses the existing AFAT type system and source-like heavy display hierarchy; visual certification is blocked.
- Spacing and layout rhythm: role-specific mobile/desktop grids are implemented; visual certification is blocked.
- Colors and visual tokens: blue passenger, emerald operator, cyan organisation, violet planner, teal government and rose admin tokens are implemented; visual certification is blocked.
- Image quality and asset fidelity: functional Leaflet map is retained instead of rasterizing the approved map; no placeholder or handcrafted SVG imagery was introduced.
- Copy and content: source journeys are represented with live-data-safe copy; unavailable fare, ETA and confidence are explicitly labelled rather than fabricated.

## Primary interactions tested

- Production access page loaded and exposed commuter, operator and staff lanes.
- Production frontend asset changed and contains `Plan safe passage`.
- Backend and dashboard production builds passed.
- Dashboard lint passed.
- Dashboard tests: 16 passed.
- API contract: 104 checks passed.
- Anonymous production authorization smoke tests: 5 passed.
- Console: no AFAT application error observed on the public production entry; one Chrome-extension metadata error was outside the application.

## Comparison history

- Iteration 1: source visuals inspected; role-specific hierarchy and functional data states implemented.
- Iteration 2: build, lint, tests, contract, deployment and public production entry verified. Visual comparison remained blocked because no equivalent authenticated implementation capture could be produced.

## Implementation checklist

- Capture approved-role production screens at matching viewports.
- Compare source and implementation in a combined visual input.
- Correct any remaining P1/P2 typography, spacing, map or navigation mismatch.
- Re-run interaction and console checks using approved non-production test identities.

final result: blocked
