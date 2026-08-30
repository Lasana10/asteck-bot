# AFAT Adaptive Service Canvas — Design QA

## Comparison target

- Source visual truth:
  - Passenger: `/workspace/scratch/af6d070aac2f/generated_images/exec-0bd2e975-48b2-47dd-99b9-588e84d5a1c2.png` (853 × 1844)
  - Operator: `/workspace/scratch/af6d070aac2f/generated_images/exec-72dec534-6c58-4272-8f92-b65e5288c28e.png` (853 × 1844)
  - Organisation: `/workspace/scratch/af6d070aac2f/generated_images/exec-36a58c5e-4dfc-4a80-9132-8bbc6ecd82d1.png` (1487 × 1058)
  - Public Partner: `/workspace/scratch/af6d070aac2f/generated_images/exec-65234d41-af55-42a5-b9b8-547109434acc.png` (1487 × 1058)
  - Planner: `/workspace/scratch/af6d070aac2f/generated_images/exec-628e2ce0-ff6f-4f3d-ac73-59e78b7b0c73.png` (1487 × 1058)
- Implementation: local Vite/Sites preview at `http://terminal.local:4173/`
- Implementation screenshot: unavailable; the Work Mode cloud-browser URL policy blocked the local preview address after the preview bridge started successfully.
- Intended viewports: 390 × 844 CSS px for Passenger and Operator; 1440 × 1024 CSS px for Organisation, Public Partner, Planner and Admin.
- Density normalization: not performed because no browser-rendered implementation capture was available.
- State: role-specific authenticated home workspace.

## Full-view comparison evidence

Blocked. All source references were opened and inspected, but the implementation could not be opened in the required cloud browser. Production compilation is not accepted as visual evidence.

## Focused-region comparison evidence

Blocked for the same reason. The required focused checks would cover the passenger passage card, operator mission card, organisation exception queue, public-partner mandate boundary, planner intervention builder and admin evidence/scope decision panel.

## Findings

- [P1] Browser-rendered implementation evidence is unavailable.
  - Location: all six role home workspaces.
  - Evidence: Sites preview reported the correct local URL, but the cloud browser rejected the address under its URL policy.
  - Impact: typography, responsive wrapping, Leaflet sizing, below-the-fold control reachability and exact visual fidelity cannot be certified.
  - Fix: repeat the same role-by-role capture and interaction pass in a Work Mode environment where `terminal.local:4173` is permitted.

## Required fidelity surfaces

- Fonts and typography: implemented with the existing AFAT type stack, role-specific hierarchy and optical weights; visual comparison blocked.
- Spacing and layout rhythm: responsive mobile/desktop grid rules implemented; visual comparison blocked.
- Colors and visual tokens: shared onyx/navy base with semantic cyan, emerald, amber, violet and restrained red; visual comparison blocked.
- Image quality and asset fidelity: existing vector logo and production Leaflet map are retained; no mockup screenshot is embedded as UI. Map tile rendering comparison blocked.
- Copy and content: role promises, authority boundaries and primary actions align with the approved references; rendered wrapping comparison blocked.

## Primary interactions intended for browser verification

- Passenger destination input → Plan safe passage → available services.
- Operator Go online → Accept mission / empty-live-demand state.
- Organisation exception → fleet or compliance workspace.
- Public Partner coordinated response → mandate-bound actions.
- Planner Run simulation → proposed outcome → prepare dispatch.
- Admin rationale requirement → stage scoped approval → governance workspace.
- Workspace switching for users with Organisation or Public Partner memberships.
- Console errors and mobile/desktop overflow.

## Comparison history

- Iteration 1: implementation compiled and preview bridge started; browser capture blocked before visual comparison. No visual fixes were claimed from non-rendered evidence.

## Implementation checklist

- [x] Preserve the current AFAT logo for later replacement.
- [x] Implement six role-distinct Adaptive Service Canvas home experiences.
- [x] Preserve existing booking, ticket, wallet, operator, fleet, planning and admin flows.
- [x] Separate entity membership from platform authority.
- [x] Correct Government/Public Partner registration so it cannot create Operator or Admin access.
- [x] Add permission-scoped Public Partner persistence and RLS.
- [x] Pass backend compilation, frontend production build, lint, frontend tests and API contracts.
- [ ] Capture and compare all six rendered role states in the required cloud browser.

final result: blocked
