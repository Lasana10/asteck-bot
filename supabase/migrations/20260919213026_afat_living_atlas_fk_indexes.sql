-- AFAT Living Atlas foreign-key/index hardening
create index if not exists afat_contribution_sessions_campaign_idx
  on public.afat_contribution_sessions(campaign_id)
  where campaign_id is not null;

create index if not exists afat_contribution_samples_contributor_idx
  on public.afat_contribution_samples(contributor_id, recorded_at desc);

create index if not exists afat_candidate_features_source_session_idx
  on public.afat_candidate_features(source_session_id)
  where source_session_id is not null;

create index if not exists afat_candidate_features_reviewed_by_idx
  on public.afat_candidate_features(reviewed_by)
  where reviewed_by is not null;
