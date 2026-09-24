-- AFAT destination graph operations.
-- Production-aligned with migration 20260924220906.

create or replace function public.afat_link_destinations(
  p_from_place_id uuid,p_to_place_id uuid,p_relation_type text,
  p_confidence numeric default 50,p_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'Destination graph permission required'; end if;
  if p_from_place_id=p_to_place_id then raise exception 'A destination cannot relate to itself'; end if;
  if p_relation_type not in ('inside','part_of','near','same_site','transfer_to','served_by','alternate_for')
    then raise exception 'Unsupported destination relation'; end if;
  if p_confidence not between 0 and 100 then raise exception 'Confidence must be 0..100'; end if;
  if not exists(select 1 from public.afat_places where id=p_from_place_id and status<>'retired') then raise exception 'Source destination not found'; end if;
  if not exists(select 1 from public.afat_places where id=p_to_place_id and status<>'retired') then raise exception 'Target destination not found'; end if;

  insert into public.afat_destination_relations(
    from_place_id,to_place_id,relation_type,confidence,evidence_status,evidence,active,updated_at
  ) values(
    p_from_place_id,p_to_place_id,p_relation_type,p_confidence,'limited',
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('linked_by',v_uid,'linked_at',now(),'automatic_truth',false),
    true,now()
  )
  on conflict(from_place_id,to_place_id,relation_type) do update set
    confidence=excluded.confidence,
    evidence_status=case when public.afat_destination_relations.evidence_status='field_verified' then 'field_verified' else 'limited' end,
    evidence=public.afat_destination_relations.evidence||excluded.evidence,
    active=true,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('id',v_id,'evidence_status','limited','automatic_truth',false);
end; $$;
revoke all on function public.afat_link_destinations(uuid,uuid,text,numeric,jsonb) from public,anon;
grant execute on function public.afat_link_destinations(uuid,uuid,text,numeric,jsonb) to authenticated;

create or replace function public.afat_review_destination_relation(
  p_relation_id uuid,p_decision text,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_state text; v_active boolean:=true;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure'))
    then raise exception 'Map evidence review permission required'; end if;
  if p_decision not in ('corroborate','verify','dispute','stale','retire') then raise exception 'Unsupported review decision'; end if;
  if not exists(select 1 from public.afat_destination_relations where id=p_relation_id) then raise exception 'Destination relation not found'; end if;

  v_state:=case p_decision when 'corroborate' then 'corroborated' when 'verify' then 'field_verified'
    when 'dispute' then 'disputed' when 'stale' then 'stale' else 'stale' end;
  if p_decision='retire' then v_active:=false; end if;

  update public.afat_destination_relations
  set evidence_status=v_state,active=v_active,
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
        'reviewed_by',v_uid,'reviewed_at',now(),'review_decision',p_decision,'review_notes',p_notes,'automatic_truth',false
      ),updated_at=now()
  where id=p_relation_id;

  return jsonb_build_object('id',p_relation_id,'evidence_status',v_state,'active',v_active,'automatic_truth',false);
end; $$;
revoke all on function public.afat_review_destination_relation(uuid,text,text) from public,anon;
grant execute on function public.afat_review_destination_relation(uuid,text,text) to authenticated;

create or replace function public.afat_destination_graph_snapshot(p_place_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_place jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'destination_kind',p.destination_kind,
    'city',p.city,'zone_label',p.zone_label,'reachability_state',p.reachability_state
  ) into v_place from public.afat_places p where p.id=p_place_id and p.status<>'retired';
  if v_place is null then raise exception 'Destination not found'; end if;

  return jsonb_build_object(
    'place',v_place,
    'outbound',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'relation_type',r.relation_type,'confidence',r.confidence,'evidence_status',r.evidence_status,
        'target',jsonb_build_object('id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'destination_kind',p.destination_kind,'city',p.city,'zone_label',p.zone_label)
      ) order by r.confidence desc)
      from public.afat_destination_relations r join public.afat_places p on p.id=r.to_place_id
      where r.from_place_id=p_place_id and r.active=true and p.status<>'retired'
    ),'[]'::jsonb),
    'inbound',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'relation_type',r.relation_type,'confidence',r.confidence,'evidence_status',r.evidence_status,
        'source',jsonb_build_object('id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'destination_kind',p.destination_kind,'city',p.city,'zone_label',p.zone_label)
      ) order by r.confidence desc)
      from public.afat_destination_relations r join public.afat_places p on p.id=r.from_place_id
      where r.to_place_id=p_place_id and r.active=true and p.status<>'retired'
    ),'[]'::jsonb),
    'automatic_truth',false
  );
end; $$;
revoke all on function public.afat_destination_graph_snapshot(uuid) from public,anon;
grant execute on function public.afat_destination_graph_snapshot(uuid) to authenticated;
