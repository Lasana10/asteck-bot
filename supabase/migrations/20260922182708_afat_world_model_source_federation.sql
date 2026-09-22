-- Production migration-history alignment.
-- The first afat_world_model_source_federation apply attempt failed atomically on a source-registry constraint.
-- No schema/data changes from that attempt are required here; the successful idempotent migration follows at 20260922184715.
select 1;
