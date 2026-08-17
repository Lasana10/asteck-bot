# AFAT Database Memory

## Tables (Core Operational)
- `profiles`
- `vehicles`
- `routes`
- `bookings`
- `seat_holds`
- `operator_wallets`
- `wallet_ledger`
- `payment_events`
- `dispatch_assignments`
- `service_requests`
- `incidents`
- `sos_events`
- `guardian_tokens`
- `compliance_records`
- `checkpoints`
- `checkpoint_memberships`
- `company_memberships`
- `notifications`
- `movement_logs`
- `map_signal_reviews`
- `auth_otp_challenges`
- `auth_refresh_sessions`
- `sentinel_directives`
- `collection_campaigns`

## Relationships (Important)
- `bookings.passenger_id -> profiles.id`
- `bookings.operator_id -> profiles.id`
- `bookings.route_id -> routes.id`
- `vehicles.operator_id -> profiles.id`
- `dispatch_assignments.service_request_id -> service_requests.id`
- `service_requests.dispatch_assignment_id -> dispatch_assignments.id`
- `guardian_tokens.booking_id -> bookings.id`
- `wallet_ledger.operator_id -> profiles.id` (operator profile context)
- `payment_events.booking_id -> bookings.id`
- `checkpoints` is the live map checkpoint/steward node table
- `checkpoint_memberships.checkpoint_id -> checkpoints.id`
- `checkpoint_memberships.profile_id -> profiles.id`
- `map_signal_reviews.movement_log_id -> movement_logs.id`
- `auth_refresh_sessions.profile_id -> profiles.id`

## Indexes (Known from migrations)
- `dispatch_assignments`: status/operator/vehicle/created indexes.
- `service_requests`: requester/status/service_type/created indexes.
- link index on `dispatch_assignments.service_request_id`.
- Additional indexes exist across older migration files in `db/`.

## Migrations Applied (Tracked in Repo)
- `db/master_migration.sql`
- `db/onboarding_migration.sql`
- `db/dispatch_ops.sql`
- `db/seat_holds_and_companies.sql`
- `db/wallet_ledger.sql`
- `db/compliance_lifecycle.sql`
- `db/security_hardening.sql`
- `db/service_requests.sql`
- legacy/additional: `db/afat_missing_tables.sql`, `db/rent_os_schema.sql`

## Pending Migrations / Reconciliation
- Confirm actual Supabase project state matches all repo SQL files.
- Reconcile overlap between:
  - `db/unified_missing_updates.sql`
  - `db/afat_missing_tables.sql`
  - `db/seat_holds_and_companies.sql`
- Ensure RLS policies for onboarding/compliance/service workflows are applied and verified.
- Apply auth/session tables and route-truth review tables if still missing in live Supabase:
  - `auth_otp_challenges`
  - `auth_refresh_sessions`
  - `map_signal_reviews`
- Apply latest June 13 schema alignment:
  - booking status/payment status expansion
  - `movement_logs.accuracy`
  - incident verification/source expansion
  - `operator_wallets`
  - `payment_events`
  - `checkpoints`
  - `checkpoint_memberships`

## Frontend Data Usage Note
- The new Mission Control frontend layer reads existing operational data through backend endpoints and does not introduce new database tables.
- It increases visibility of empty/live states, so seed data and migration parity now matter more for investor demos.
