create table if not exists public.afat_safety_signals (
  id uuid primary key default gen_random_uuid(), dispatch_assignment_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  signal_type text not null check(signal_type in ('stale_operator_presence','operator_offline_during_journey','journey_state_stalled','active_journey_duration_outlier')),
  severity text not null default 'review' check(severity in ('info','review','urgent_review')), status text not null default 'open' check(status in ('open','acknowledged','resolved','dismissed')),
  detected_at timestamptz not null default now(), resolved_at timestamptz, evidence jsonb not null default jsonb_build_object('automatic_truth',false,'requires_human_review',true),
  unique(dispatch_assignment_id,signal_type,status)
);
create index if not exists afat_safety_signals_assignment_status_idx on public.afat_safety_signals(dispatch_assignment_id,status,detected_at desc);
alter table public.afat_safety_signals enable row level security; revoke insert,update,delete on public.afat_safety_signals from anon,authenticated; grant select on public.afat_safety_signals to authenticated;
drop policy if exists afat_safety_signal_participant_read on public.afat_safety_signals;
create policy afat_safety_signal_participant_read on public.afat_safety_signals for select to authenticated using (exists(select 1 from public.dispatch_assignments da left join public.bookings b on b.id=da.booking_id where da.id=dispatch_assignment_id and (da.operator_id=auth.uid() or b.passenger_id=auth.uid())) or public.afat_has_permission('system.configure'));

create or replace function public.afat_evaluate_journey_safety(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_role text:=auth.role(); v_a public.dispatch_assignments%rowtype; v_v public.vehicles%rowtype; v_passenger uuid; v_allowed boolean:=false; v_created jsonb:='[]'::jsonb; v_age interval;
begin
  select * into v_a from public.dispatch_assignments where id=p_assignment_id; if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  select passenger_id into v_passenger from public.bookings where id=v_a.booking_id;
  v_allowed:=v_role='service_role' or v_uid=v_a.operator_id or v_uid=v_passenger or (v_uid is not null and public.afat_has_permission('system.configure')); if not v_allowed then raise exception 'SAFETY_SIGNAL_ACCESS_DENIED'; end if;
  if v_a.status not in ('en_route','arrived','pickup_verified','in_journey','emergency','disputed') then return jsonb_build_object('assignment_id',v_a.id,'evaluated',false,'reason','journey_not_active'); end if;
  if v_a.vehicle_id is not null then select * into v_v from public.vehicles where id=v_a.vehicle_id; end if;
  if v_v.id is not null and (v_v.last_ping_at is null or v_v.last_ping_at<now()-interval '4 minutes') then insert into public.afat_safety_signals(dispatch_assignment_id,signal_type,severity,evidence) values(v_a.id,'stale_operator_presence','review',jsonb_build_object('automatic_truth',false,'requires_human_review',true,'assignment_status',v_a.status,'last_ping_at',v_v.last_ping_at,'threshold_seconds',240)) on conflict(dispatch_assignment_id,signal_type,status) do nothing; v_created:=v_created||jsonb_build_array('stale_operator_presence'); end if;
  if v_v.id is not null and coalesce(v_v.is_available,false)=false and v_a.status in ('pickup_verified','in_journey') then insert into public.afat_safety_signals(dispatch_assignment_id,signal_type,severity,evidence) values(v_a.id,'operator_offline_during_journey','review',jsonb_build_object('automatic_truth',false,'requires_human_review',true,'assignment_status',v_a.status)) on conflict(dispatch_assignment_id,signal_type,status) do nothing; v_created:=v_created||jsonb_build_array('operator_offline_during_journey'); end if;
  v_age:=now()-coalesce(v_a.updated_at,v_a.created_at);
  if (v_a.status in ('en_route','arrived') and v_age>interval '45 minutes') or (v_a.status='pickup_verified' and v_age>interval '30 minutes') then insert into public.afat_safety_signals(dispatch_assignment_id,signal_type,severity,evidence) values(v_a.id,'journey_state_stalled','review',jsonb_build_object('automatic_truth',false,'requires_human_review',true,'assignment_status',v_a.status,'state_age_seconds',extract(epoch from v_age)::integer)) on conflict(dispatch_assignment_id,signal_type,status) do nothing; v_created:=v_created||jsonb_build_array('journey_state_stalled'); end if;
  if v_a.status='in_journey' and now()-coalesce(v_a.started_at,v_a.updated_at,v_a.created_at)>interval '4 hours' then insert into public.afat_safety_signals(dispatch_assignment_id,signal_type,severity,evidence) values(v_a.id,'active_journey_duration_outlier','urgent_review',jsonb_build_object('automatic_truth',false,'requires_human_review',true,'started_at',v_a.started_at,'threshold_seconds',14400)) on conflict(dispatch_assignment_id,signal_type,status) do nothing; v_created:=v_created||jsonb_build_array('active_journey_duration_outlier'); end if;
  return jsonb_build_object('assignment_id',v_a.id,'evaluated',true,'signals_considered',v_created,'automatic_emergency',false,'requires_human_review',true);
end $$;

create or replace function public.afat_review_safety_signal(p_signal_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_role text:=auth.role(); v_s public.afat_safety_signals%rowtype;
begin
  if p_status not in ('acknowledged','resolved','dismissed') then raise exception 'SAFETY_SIGNAL_STATUS_INVALID'; end if;
  if v_role<>'service_role' and (v_uid is null or not public.afat_has_permission('system.configure')) then raise exception 'SAFETY_REVIEW_AUTHORITY_REQUIRED'; end if;
  select * into v_s from public.afat_safety_signals where id=p_signal_id for update; if not found then raise exception 'SAFETY_SIGNAL_NOT_FOUND'; end if;
  update public.afat_safety_signals set status=p_status,resolved_at=case when p_status in ('resolved','dismissed') then now() else null end,evidence=evidence||jsonb_build_object('reviewed_by',v_uid,'reviewed_at',now()) where id=p_signal_id;
  return jsonb_build_object('id',p_signal_id,'status',p_status);
end $$;
revoke all on function public.afat_evaluate_journey_safety(uuid) from public,anon; revoke all on function public.afat_review_safety_signal(uuid,text) from public,anon,authenticated;
grant execute on function public.afat_evaluate_journey_safety(uuid) to authenticated,service_role; grant execute on function public.afat_review_safety_signal(uuid,text) to service_role;
