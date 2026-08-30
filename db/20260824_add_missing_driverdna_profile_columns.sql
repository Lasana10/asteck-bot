alter table public.profiles
  add column if not exists driver_dna_score numeric(5,2) default 75.0,
  add column if not exists driver_dna_tier text default 'Insufficient verified evidence',
  add column if not exists trust_score integer default 50;

alter table public.profiles
  drop constraint if exists profiles_driver_dna_tier_check;

alter table public.profiles
  add constraint profiles_driver_dna_tier_check
  check (driver_dna_tier in ('Insufficient verified evidence', 'Recruit', 'Standard', 'Elite', 'Sentinel', 'Legend'));

alter table public.profiles
  drop constraint if exists profiles_trust_score_check;

alter table public.profiles
  add constraint profiles_trust_score_check
  check (trust_score >= 0 and trust_score <= 100);

update public.profiles
set trust_score = coalesce(trust_score, trust_points, 50),
    driver_dna_tier = coalesce(driver_dna_tier, 'Insufficient verified evidence'),
    driver_dna_score = coalesce(driver_dna_score, 75.0)
where trust_score is null
   or driver_dna_tier is null
   or driver_dna_score is null;
