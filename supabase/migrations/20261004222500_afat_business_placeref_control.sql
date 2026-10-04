create unique index if not exists afat_destination_claims_active_claimant_uidx
  on public.afat_destination_claims(place_id,claimant_id)
  where status in ('submitted','review','approved');

alter table public.afat_destination_claims enable row level security;
revoke insert,update,delete on public.afat_destination_claims from anon,authenticated;
grant select on public.afat_destination_claims to authenticated;

drop policy if exists afat_destination_claims_owner_review_read on public.afat_destination_claims;
create policy afat_destination_claims_owner_review_read on public.afat_destination_claims for select to authenticated using (
  claimant_id=auth.uid() or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')
);

create table if not exists public.afat_place_update_proposals (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.afat_places(id) on delete cascade,
  claim_id uuid not null references public.afat_destination_claims(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  proposal_kind text not null check (proposal_kind in ('entrance','hours','parking','pickup','delivery','contact','accessibility','business_profile')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','review','approved','rejected','superseded')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  applied_access_point_id uuid references public.afat_access_points(id) on delete set null,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false,'assertion_kind','owner_asserted'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists afat_place_update_proposals_place_status_idx on public.afat_place_update_proposals(place_id,status,created_at desc);
create index if not exists afat_place_update_proposals_claim_idx on public.afat_place_update_proposals(claim_id,created_at desc);
alter table public.afat_place_update_proposals enable row level security;
revoke insert,update,delete on public.afat_place_update_proposals from anon,authenticated;
grant select on public.afat_place_update_proposals to authenticated;
drop policy if exists afat_place_update_proposals_owner_review_read on public.afat_place_update_proposals;
create policy afat_place_update_proposals_owner_review_read on public.afat_place_update_proposals for select to authenticated using (
  proposer_id=auth.uid() or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')
);

create or replace function public.afat_submit_destination_claim(p_place_id uuid,p_claim_type text,p_evidence jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_claim_type not in ('business','organization','resident','manager','institution') then raise exception 'Unsupported claim type'; end if;
  if not exists(select 1 from public.afat_places where id=p_place_id and status<>'retired') then raise exception 'Place not found'; end if;
  select id into v_id from public.afat_destination_claims where place_id=p_place_id and claimant_id=v_uid and status in ('submitted','review','approved') order by created_at desc limit 1;
  if v_id is not null then return jsonb_build_object('id',v_id,'status',(select status from public.afat_destination_claims where id=v_id),'existing',true); end if;
  insert into public.afat_destination_claims(place_id,claimant_id,claim_type,status,evidence)
  values(p_place_id,v_uid,p_claim_type,'submitted',coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false,'claimant_assertion',true)) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','submitted','automatic_truth',false);
end $$;

create or replace function public.afat_review_destination_claim(p_claim_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_claim public.afat_destination_claims%rowtype; v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Claim review permission required'; end if;
  if p_decision not in ('approve','reject','review','revoke') then raise exception 'Unsupported decision'; end if;
  select * into v_claim from public.afat_destination_claims where id=p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'review' then 'review' else 'revoked' end;
  update public.afat_destination_claims set status=v_status,reviewed_by=v_uid,reviewed_at=now(),review_notes=nullif(trim(p_notes),''),updated_at=now() where id=p_claim_id;
  return jsonb_build_object('id',p_claim_id,'status',v_status,'automatic_truth',false);
end $$;

create or replace function public.afat_submit_place_update_proposal(p_claim_id uuid,p_proposal_kind text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_claim public.afat_destination_claims%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_proposal_kind not in ('entrance','hours','parking','pickup','delivery','contact','accessibility','business_profile') then raise exception 'Unsupported proposal kind'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Proposal payload must be an object'; end if;
  select * into v_claim from public.afat_destination_claims where id=p_claim_id and claimant_id=v_uid and status='approved';
  if not found then raise exception 'An approved destination claim is required'; end if;
  insert into public.afat_place_update_proposals(place_id,claim_id,proposer_id,proposal_kind,payload,evidence)
  values(v_claim.place_id,v_claim.id,v_uid,p_proposal_kind,p_payload,jsonb_build_object('automatic_truth',false,'assertion_kind','owner_asserted','claim_type',v_claim.claim_type)) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','submitted','automatic_truth',false,'message','Owner update submitted for AFAT review.');
end $$;

create or replace function public.afat_review_place_update_proposal(p_proposal_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_uid uuid:=auth.uid(); v_prop public.afat_place_update_proposals%rowtype; v_access_id uuid; v_lat double precision; v_lon double precision;
  v_access_type text; v_modes text[]; v_fp text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Place update review permission required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Decision must be approve or reject'; end if;
  select * into v_prop from public.afat_place_update_proposals where id=p_proposal_id for update;
  if not found then raise exception 'Proposal not found'; end if;
  if v_prop.status not in ('submitted','review') then return jsonb_build_object('id',v_prop.id,'status',v_prop.status,'applied_access_point_id',v_prop.applied_access_point_id); end if;
  if p_decision='reject' then
    update public.afat_place_update_proposals set status='rejected',reviewed_by=v_uid,reviewed_at=now(),review_notes=nullif(trim(p_notes),''),updated_at=now() where id=v_prop.id;
    return jsonb_build_object('id',v_prop.id,'status','rejected','automatic_truth',false);
  end if;
  if v_prop.proposal_kind='entrance' then
    v_lat:=nullif(v_prop.payload->>'latitude','')::double precision; v_lon:=nullif(v_prop.payload->>'longitude','')::double precision;
    v_access_type:=coalesce(nullif(v_prop.payload->>'access_type',''),'unknown');
    if v_lat is null or v_lon is null or v_lat not between -90 and 90 or v_lon not between -180 and 180 then raise exception 'Entrance proposal needs valid latitude and longitude'; end if;
    if v_access_type not in ('pedestrian','vehicle','moto','delivery','emergency','service','transit','unknown') then raise exception 'Unsupported access type'; end if;
    select coalesce(array_agg(value),'{}'::text[]) into v_modes from jsonb_array_elements_text(coalesce(v_prop.payload->'access_modes','[]'::jsonb)) value;
    v_fp:=md5(v_prop.place_id::text||':'||round(v_lat::numeric,5)::text||':'||round(v_lon::numeric,5)::text||':'||v_access_type);
    insert into public.afat_access_points(place_id,access_type,name,instructions,latitude,longitude,location,access_modes,confidence,evidence_status,source_kind,opening_rules,evidence,active,fingerprint)
    values(v_prop.place_id,v_access_type,coalesce(nullif(v_prop.payload->>'name',''),'Owner asserted entrance'),nullif(v_prop.payload->>'instructions',''),v_lat,v_lon,
      st_setsrid(st_makepoint(v_lon,v_lat),4326)::geography,v_modes,55,'limited','owner_claim','{}'::jsonb,
      jsonb_build_object('automatic_truth',false,'owner_asserted',true,'claim_id',v_prop.claim_id,'proposal_id',v_prop.id,'reviewed_by',v_uid,'reviewed_at',now()),true,v_fp)
    on conflict(fingerprint) do update set updated_at=now(),evidence=public.afat_access_points.evidence||excluded.evidence returning id into v_access_id;
  else
    update public.afat_places p set metadata=jsonb_set(coalesce(p.metadata,'{}'::jsonb),'{business_profile}',
      coalesce(p.metadata->'business_profile','{}'::jsonb)||jsonb_build_object(v_prop.proposal_kind,v_prop.payload)||jsonb_build_object('owner_asserted',true,'last_reviewed_at',now(),'automatic_truth',false),true),updated_at=now()
    where p.id=v_prop.place_id;
  end if;
  update public.afat_place_update_proposals set status='approved',reviewed_by=v_uid,reviewed_at=now(),review_notes=nullif(trim(p_notes),''),applied_access_point_id=v_access_id,updated_at=now() where id=v_prop.id;
  return jsonb_build_object('id',v_prop.id,'status','approved','applied_access_point_id',v_access_id,'automatic_truth',false,'owner_asserted',true);
end $$;

revoke all on function public.afat_submit_destination_claim(uuid,text,jsonb) from public,anon;
revoke all on function public.afat_review_destination_claim(uuid,text,text) from public,anon;
revoke all on function public.afat_submit_place_update_proposal(uuid,text,jsonb) from public,anon;
revoke all on function public.afat_review_place_update_proposal(uuid,text,text) from public,anon;
grant execute on function public.afat_submit_destination_claim(uuid,text,jsonb) to authenticated;
grant execute on function public.afat_review_destination_claim(uuid,text,text) to authenticated;
grant execute on function public.afat_submit_place_update_proposal(uuid,text,jsonb) to authenticated;
grant execute on function public.afat_review_place_update_proposal(uuid,text,text) to authenticated;