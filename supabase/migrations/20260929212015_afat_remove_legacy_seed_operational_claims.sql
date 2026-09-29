update public.afat_places
set successful_pickups=0,
    failed_pickups=0,
    base_confidence=least(base_confidence,35),
    status='unverified',
    evidence_status='limited',
    description='Seed reference requiring independent AFAT verification.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'legacy_seed_reference',true,
      'operational_counts_reset',true,
      'automatic_truth',false
    ),
    updated_at=now()
where id='10000000-0000-4000-8000-000000000001';

update public.afat_meeting_points
set successful_pickups=0,
    failed_pickups=0,
    confidence=least(confidence,35),
    status='review',
    evidence_status='limited',
    instructions='Reference point only — verify the exact entrance and meeting instructions on site before operational use.',
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'legacy_seed_reference',true,
      'operational_counts_reset',true,
      'automatic_truth',false
    ),
    updated_at=now()
where id='20000000-0000-4000-8000-000000000001';
