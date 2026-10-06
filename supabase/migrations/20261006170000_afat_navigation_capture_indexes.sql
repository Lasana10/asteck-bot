create index if not exists afat_navigation_samples_profile_time_idx
on public.afat_navigation_samples(profile_id, recorded_at desc);

create index if not exists afat_navigation_sessions_profile_status_idx
on public.afat_navigation_sessions(profile_id, status, updated_at desc);