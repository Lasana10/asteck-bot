create table if not exists public.afat_activation_missions (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  proof_key text not null,
  title text not null,
  instruction text not null,
  actor_hint text not null,
  target_count integer not null default 1 check (target_count > 0),
  observed_count integer not null default 0 check (observed_count >= 0),
  status text not null default 'open' check (status in ('open','completed')),
  completed_at timestamptz,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_key,proof_key)
);
create index if not exists afat_activation_missions_city_status_idx on public.afat_activation_missions(city_key,status,updated_at desc);
alter table public.afat_activation_missions enable row level security;
revoke insert,update,delete on public.afat_activation_missions from anon,authenticated;
grant select on public.afat_activation_missions to authenticated;
drop policy if exists afat_activation_missions_planner_read on public.afat_activation_missions;
create policy afat_activation_missions_planner_read on public.afat_activation_missions for select to authenticated using (
  public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')
);

create or replace function public.afat_refresh_activation_missions(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_snapshot jsonb; v_rows jsonb; v_total integer; v_completed integer; v_city_name text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
  select city_name into v_city_name from public.afat_city_profiles where city_key=p_city_key and status='active';
  if v_city_name is null then raise exception 'Active city profile not found'; end if;
  v_snapshot:=public.afat_operational_proof_snapshot(p_city_key);

  insert into public.afat_activation_missions(city_key,proof_key,title,instruction,actor_hint,target_count,observed_count,status,completed_at,evidence)
  values
    (p_city_key,'coverage','Process the first real city ingestion cell','Run City Expansion on an explicitly reviewed city envelope. Candidate topology must come from the authenticated ingestion runner; do not seed fake completion.','planner/admin',1,coalesce((v_snapshot#>>'{city_ingestion,completed_cells}')::int,0),case when coalesce((v_snapshot#>>'{city_ingestion,completed_cells}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{city_ingestion,completed_cells}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','city_ingestion.completed_cells')),
    (p_city_key,'contribution','Capture the first genuine movement contribution','Record a real field trace until at least one contribution sample is saved server-side. Zero-sample sessions do not count.','field contributor',1,coalesce((v_snapshot#>>'{contribution,saved_samples}')::int,0),case when coalesce((v_snapshot#>>'{contribution,saved_samples}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{contribution,saved_samples}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','contribution.saved_samples')),
    (p_city_key,'navigation','Complete the first real navigation journey','Start navigation on a phone, move with fresh GPS, save server samples, and arrive at the selected destination.','passenger/tester',1,coalesce((v_snapshot#>>'{navigation,samples}')::int,0),case when coalesce((v_snapshot#>>'{navigation,samples}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{navigation,samples}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','navigation.samples')),
    (p_city_key,'entrance','Verify the first real entrance or access point','Capture a real gate/entrance/access point with GPS and local instructions, then have an authorized reviewer accept it.','community + reviewer',1,coalesce((v_snapshot#>>'{last_100m,active_access_points}')::int,0),case when coalesce((v_snapshot#>>'{last_100m,active_access_points}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{last_100m,active_access_points}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','last_100m.active_access_points')),
    (p_city_key,'transit','Build the first reviewed transit line','Capture real stop/line observations, review them, and create at least one active line backed by ordered transit evidence.','community + reviewer',1,coalesce((v_snapshot#>>'{transit,active_lines}')::int,0),case when coalesce((v_snapshot#>>'{transit,active_lines}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{transit,active_lines}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','transit.active_lines')),
    (p_city_key,'supply','Bring the first verified operator live','Use an approved operator and verified vehicle, grant current-location access, and keep a fresh presence ping under the live-supply freshness window.','operator',1,coalesce((v_snapshot#>>'{supply,fresh_verified_vehicles}')::int,0),case when coalesce((v_snapshot#>>'{supply,fresh_verified_vehicles}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{supply,fresh_verified_vehicles}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','supply.fresh_verified_vehicles')),
    (p_city_key,'dispatch','Complete the first real dispatch','Create a genuine passenger/service request, match it to fresh verified supply, progress the dispatch state machine, and close the assignment.','passenger + operator',1,coalesce((v_snapshot#>>'{dispatch,completed_assignments}')::int,0),case when coalesce((v_snapshot#>>'{dispatch,completed_assignments}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{dispatch,completed_assignments}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','dispatch.completed_assignments')),
    (p_city_key,'delivery','Complete the first proof-backed delivery','Create a real delivery request, verify sender pickup, capture delivery proof, confirm recipient, and close the service request.','sender + courier + recipient',1,coalesce((v_snapshot#>>'{delivery,proof_events}')::int,0),case when coalesce((v_snapshot#>>'{delivery,proof_events}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{delivery,proof_events}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','delivery.proof_events')),
    (p_city_key,'settlement','Post the first real operator settlement','Complete a real paid/cash-confirmed booking so the exactly-once ride-credit ledger posts a genuine operator credit.','operations/payment provider',1,coalesce((v_snapshot#>>'{money,posted_ride_credits}')::int,0),case when coalesce((v_snapshot#>>'{money,posted_ride_credits}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{money,posted_ride_credits}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','money.posted_ride_credits')),
    (p_city_key,'eta','Create the first trusted ETA corridor','Accumulate enough opted-in completed journeys on the same corridor/time bucket for a corroborated or field-verified speed profile.','real journeys + learning opt-in',1,coalesce((v_snapshot#>>'{eta_learning,trusted_profiles}')::int,0),case when coalesce((v_snapshot#>>'{eta_learning,trusted_profiles}')::int,0)>=1 then 'completed' else 'open' end,case when coalesce((v_snapshot#>>'{eta_learning,trusted_profiles}')::int,0)>=1 then now() else null end,jsonb_build_object('automatic_truth',false,'proof_source','eta_learning.trusted_profiles'))
  on conflict(city_key,proof_key) do update set title=excluded.title,instruction=excluded.instruction,actor_hint=excluded.actor_hint,target_count=excluded.target_count,observed_count=excluded.observed_count,status=excluded.status,completed_at=case when excluded.status='completed' then coalesce(public.afat_activation_missions.completed_at,excluded.completed_at) else null end,evidence=public.afat_activation_missions.evidence||excluded.evidence,updated_at=now();

  select count(*),count(*) filter(where status='completed') into v_total,v_completed from public.afat_activation_missions where city_key=p_city_key;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'proof_key',proof_key,'title',title,'instruction',instruction,'actor_hint',actor_hint,'target_count',target_count,'observed_count',observed_count,'status',status,'completed_at',completed_at,'updated_at',updated_at) order by case proof_key when 'coverage' then 1 when 'contribution' then 2 when 'navigation' then 3 when 'entrance' then 4 when 'transit' then 5 when 'supply' then 6 when 'dispatch' then 7 when 'delivery' then 8 when 'settlement' then 9 else 10 end),'[]'::jsonb) into v_rows from public.afat_activation_missions where city_key=p_city_key;
  return jsonb_build_object('city_key',p_city_key,'city_name',v_city_name,'completed',v_completed,'total',v_total,'missions',v_rows,'generated_at',now(),'automatic_truth',false);
end $$;

revoke all on function public.afat_refresh_activation_missions(text) from public,anon;
grant execute on function public.afat_refresh_activation_missions(text) to authenticated;
