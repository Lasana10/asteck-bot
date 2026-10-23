-- Authenticated operations API controls reviewer identity. Only service_role may
-- invoke this transactional function: record a decision, update an incident,
-- and append immutable evidence in ONE Postgres transaction.
create table if not exists public.map_signal_reviews(
 movement_log_id uuid primary key references public.movement_logs(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(id) on delete restrict,
 status text not null check(status in ('queued','validated','dismissed','published')),
 confidence_score integer not null default 50 check(confidence_score between 0 and 100),
 decision_notes text,
 reward_points integer not null default 0 check(reward_points between 0 and 100),
 reviewed_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists public.afat_map_review_events(
 id uuid primary key default gen_random_uuid(),
 movement_log_id uuid not null references public.movement_logs(id) on delete restrict,
 incident_id uuid references public.incidents(id) on delete restrict,
 reviewer_id uuid not null references public.profiles(id) on delete restrict,
 old_status text,
 decision text not null check(decision in ('queued','validated','dismissed','published')),
 notes text not null,
 confidence_score integer not null check(confidence_score between 0 and 100),
 created_at timestamptz not null default now()
);
create index if not exists afat_map_review_events_movement_idx
 on public.afat_map_review_events(movement_log_id,created_at desc);
alter table public.map_signal_reviews enable row level security;
alter table public.afat_map_review_events enable row level security;
revoke all on public.map_signal_reviews,public.afat_map_review_events from anon,authenticated;
grant select,insert,update on public.map_signal_reviews to service_role;
grant select,insert on public.afat_map_review_events to service_role;
create or replace function public.afat_apply_incident_review(
 p_movement_log_id uuid,p_reviewer_id uuid,p_status text,
 p_confidence integer,p_notes text
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
 v_movement public.movement_logs%rowtype;
 v_incident public.incidents%rowtype;
 v_previous text;
 v_new_status text;
 v_note text:=trim(coalesce(p_notes,''));
 v_changed boolean;
 v_event uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then
  raise exception 'AFAT_REVIEW_SERVICE_ROLE_REQUIRED' using errcode='42501';
 end if;
 if p_movement_log_id is null or p_reviewer_id is null
    or p_status not in ('queued','validated','dismissed','published')
    or p_confidence not between 0 and 100
    or char_length(v_note)<15 or char_length(v_note)>2000 then
  raise exception 'AFAT_REVIEW_VALID_FIELDS_AND_EVIDENCE_REQUIRED' using errcode='22023';
 end if;
 if not exists (select 1 from public.profiles
  where id=p_reviewer_id and lower(role) in ('admin','planner')
  and is_active is true) then
  raise exception 'AFAT_REVIEWER_NOT_ACTIVE_STAFF' using errcode='42501';
 end if;
 select * into v_movement from public.movement_logs where id=p_movement_log_id for update;
 if not found then raise exception 'AFAT_MOVEMENT_EVIDENCE_NOT_FOUND' using errcode='P0002';end if;
 select * into v_incident from public.incidents
  where movement_log_id=p_movement_log_id for update;
 if not found then raise exception 'AFAT_LINKED_INCIDENT_NOT_FOUND' using errcode='P0002';end if;
 if v_incident.status in ('resolved','expired','false','dismissed') then
  raise exception 'AFAT_CLOSED_INCIDENT_CANNOT_BE_REPUBLISHED' using errcode='P0001';
 end if;
 v_previous:=coalesce(v_incident.verification_status,v_incident.status,'pending');
 v_new_status:=case when p_status in ('validated','published') then 'verified'
                    when p_status='dismissed' then 'dismissed' else 'pending' end;
 v_changed:=v_previous is distinct from v_new_status
  or coalesce(v_incident.status,'') is distinct from v_new_status;
 insert into public.map_signal_reviews
 (movement_log_id,reviewer_id,status,confidence_score,decision_notes,reward_points,reviewed_at,updated_at)
 values (p_movement_log_id,p_reviewer_id,p_status,p_confidence,v_note,0,
   case when p_status='queued' then null else now() end,now())
 on conflict(movement_log_id) do update
 set reviewer_id=excluded.reviewer_id,status=excluded.status,
 confidence_score=excluded.confidence_score,decision_notes=excluded.decision_notes,
 reward_points=0,reviewed_at=excluded.reviewed_at,updated_at=now();
 update public.incidents set status=v_new_status,
  verification_status=v_new_status,confidence_score=p_confidence,
  resolved_at=case when v_new_status='dismissed' then now() else null end,
  resolver_id=case when v_new_status='dismissed' then p_reviewer_id else null end
 where id=v_incident.id;
 insert into public.afat_map_review_events
  (movement_log_id,incident_id,reviewer_id,old_status,decision,notes,confidence_score)
 values(p_movement_log_id,v_incident.id,p_reviewer_id,v_previous,p_status,v_note,p_confidence)
 returning id into v_event;
 return jsonb_build_object('movement_log_id',p_movement_log_id,
  'incident_id',v_incident.id,'review_status',p_status,
  'incident_verification_status',v_new_status,
  'changed',v_changed,'review_event_id',v_event,'reward_points_awarded',0);
end;
$$;
revoke all on function public.afat_apply_incident_review(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.afat_apply_incident_review(uuid,uuid,text,integer,text) to service_role;
