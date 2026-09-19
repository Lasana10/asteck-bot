-- Source-controlled copy of production migration 20260919214904 afat_living_city_internal_function_lockdown

revoke all on function public.afat_candidate_after_insert() from public,anon,authenticated;
revoke all on function public.afat_ingest_passage_negative_evidence() from public,anon,authenticated;

