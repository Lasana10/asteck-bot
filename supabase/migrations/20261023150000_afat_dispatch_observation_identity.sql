-- Distinct legitimate fixes can have the same device timestamp. Use observation
-- identity for idempotency, not a timestamp that can collide.
alter table public.afat_journey_samples
  add column if not exists observation_id uuid;

alter table public.afat_journey_samples
  drop constraint if exists afat_journey_samples_journey_id_profile_id_recorded_at_key;

create unique index if not exists afat_journey_samples_observation_identity_uq
  on public.afat_journey_samples(journey_id, profile_id, observation_id)
  where observation_id is not null;

comment on column public.afat_journey_samples.observation_id is
  'Client-generated stable GPS observation identity; nullable for previously ingested evidence.';
