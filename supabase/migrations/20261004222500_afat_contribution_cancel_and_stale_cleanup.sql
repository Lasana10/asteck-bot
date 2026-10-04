create or replace function public.afat_cancel_contribution_session(p_session_id uuid,p_reason text default 'user_cancelled')
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_row public.afat_contribution_sessions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_row from public.afat_contribution_sessions where id=p_session_id and contributor_id=v_uid for update;
  if not found then raise exception 'CONTRIBUTION_SESSION_NOT_FOUND'; end if;
  if v_row.status<>'active' then return jsonb_build_object('id',v_row.id,'status',v_row.status,'idempotent',true); end if;
  update public.afat_contribution_sessions
  set status='discarded',ended_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object(
    'discard_reason',left(coalesce(nullif(trim(p_reason),''),'user_cancelled'),160),
    'discarded_at',now(),'sample_count_at_discard',sample_count,'automatic_truth',false
  ) where id=v_row.id;
  return jsonb_build_object('id',v_row.id,'status','discarded','sample_count',v_row.sample_count,'evidence_preserved',v_row.sample_count>0);
end $$;

create or replace function public.afat_cleanup_stale_zero_sample_contributions(p_stale_hours integer default 24)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_count integer; v_hours integer:=greatest(1,least(coalesce(p_stale_hours,24),720));
begin
  update public.afat_contribution_sessions
  set status='discarded',ended_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('discard_reason','stale_zero_sample_session','discarded_at',now(),'automatic_truth',false)
  where status='active' and sample_count=0 and started_at<now()-make_interval(hours=>v_hours);
  get diagnostics v_count=row_count;
  return jsonb_build_object('discarded',v_count,'stale_hours',v_hours);
end $$;

revoke all on function public.afat_cancel_contribution_session(uuid,text) from public,anon;
revoke all on function public.afat_cleanup_stale_zero_sample_contributions(integer) from public,anon,authenticated;
grant execute on function public.afat_cancel_contribution_session(uuid,text) to authenticated;
grant execute on function public.afat_cleanup_stale_zero_sample_contributions(integer) to service_role;

update public.afat_contribution_sessions
set status='discarded',ended_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('discard_reason','migration_cleanup_stale_zero_sample_session','discarded_at',now(),'automatic_truth',false)
where status='active' and sample_count=0 and started_at<now()-interval '24 hours';

update public.afat_contribution_sessions s
set status='discarded',updated_at=now(),metadata=s.metadata||jsonb_build_object('discard_reason','legacy_zero_sample_completion_reclassified','reclassified_at',now(),'automatic_truth',false)
where s.status='completed' and s.sample_count=0
  and not exists(select 1 from public.afat_contribution_samples cs where cs.session_id=s.id);
