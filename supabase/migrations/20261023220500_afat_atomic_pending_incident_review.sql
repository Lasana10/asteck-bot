-- Controlled incident decision path. Only the authenticated AFAT backend's
-- service role may invoke the atomic decision, after its role-based check.
-- Atlas promotion remains owned by the existing verified incident trigger.
create table if not exists public.afat_incident_review_events(
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check(decision in ('verify','dismiss')),
  decision_notes text not null check(char_length(decision_notes) between 12 and 1000),
  previous_status text not null,
  previous_verification_status text,
  created_at timestamptz not null default now()
);
create index if not exists afat_incident_review_events_incident_created
  on public.afat_incident_review_events(incident_id,created_at desc);
alter table public.afat_incident_review_events enable row level security;
revoke all on public.afat_incident_review_events from anon,authenticated;
grant select,insert on public.afat_incident_review_events to service_role;

create or replace function public.afat_decide_pending_incident(
  p_incident_id uuid,p_reviewer_id uuid,p_decision text,p_notes text
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_incident public.incidents%rowtype;
  v_reviewer public.profiles%rowtype;
  v_notes text:=trim(coalesce(p_notes,''));
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'SERVER_AUTHORITY_REQUIRED' using errcode='42501';
  end if;
  if p_incident_id is null or p_reviewer_id is null or
     p_decision not in ('verify','dismiss') or
     char_length(v_notes) not between 12 and 1000 then
    raise exception 'INVALID_INCIDENT_DECISION' using errcode='22023';
  end if;
  select * into v_reviewer from public.profiles where id=p_reviewer_id;
  if not found or coalesce(v_reviewer.role,'') not in ('admin','planner')
      or v_reviewer.is_active is distinct from true then
    raise exception 'REVIEWER_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select * into v_incident from public.incidents where id=p_incident_id for update;
  if not found then raise exception 'INCIDENT_NOT_FOUND' using errcode='P0002'; end if;
  if lower(coalesce(v_incident.verification_status,'')) not in ('pending','new')
     or lower(coalesce(v_incident.status,'')) not in ('pending','new') then
    raise exception 'INCIDENT_NOT_PENDING' using errcode='P0001';
  end if;
  if p_decision='verify' and v_incident.expires_at<=now() then
    raise exception 'INCIDENT_ALREADY_EXPIRED' using errcode='P0001';
  end if;
  update public.incidents set
    status=case when p_decision='verify' then 'verified' else 'dismissed' end,
    verification_status=case when p_decision='verify' then 'verified' else 'rejected' end,
    resolver_id=p_reviewer_id,
    resolved_at=case when p_decision='dismiss' then now() else null end
  where id=p_incident_id;
  insert into public.afat_incident_review_events(
    incident_id,reviewer_id,decision,decision_notes,previous_status,previous_verification_status
  ) values (
    p_incident_id,p_reviewer_id,p_decision,v_notes,v_incident.status,v_incident.verification_status
  );
  return jsonb_build_object(
    'incident_id',p_incident_id,'decision',p_decision,
    'status',case when p_decision='verify' then 'verified' else 'dismissed' end,
    'reviewed',true,'automatic_truth',false
  );
end;
$$;
revoke all on function public.afat_decide_pending_incident(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.afat_decide_pending_incident(uuid,uuid,text,text)
  to service_role;
