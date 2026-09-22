-- Close AFAT source discrepancy -> mission -> evidence -> human review -> truth-state loop.
create or replace function public.afat_source_mission_submission_bridge()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_discrepancy uuid;
begin
  if new.status='submitted' and old.status is distinct from new.status and new.evidence ? 'source_discrepancy_id' then
    begin
      v_discrepancy := (new.evidence->>'source_discrepancy_id')::uuid;
      update public.afat_source_discrepancies
      set status='under_review',
          evidence=evidence||jsonb_build_object('submitted_mission_id',new.id,'submitted_at',new.submitted_at),
          updated_at=now()
      where id=v_discrepancy and status in('open','missioned','under_review');
    exception when invalid_text_representation then null;
    end;
  end if;
  return new;
end;$$;

drop trigger if exists trg_afat_source_mission_submission on public.afat_micro_missions;
create trigger trg_afat_source_mission_submission
after update of status on public.afat_micro_missions
for each row execute function public.afat_source_mission_submission_bridge();

create or replace function public.afat_source_mission_review_queue(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_result jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Map evidence review permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'mission_id',m.id,'title',m.title,'question',m.question,'answer',m.answer,'evidence',m.evidence,
   'target_edge_id',m.target_edge_id,'target_place_id',m.target_place_id,'claimed_by',m.claimed_by,
   'submitted_at',m.submitted_at,'priority',m.priority,
   'discrepancy_id',d.id,'discrepancy_type',d.discrepancy_type,'headline',d.headline,
   'information_value',d.information_value,'uncertainty',d.uncertainty,
   'edge_name',e.canonical_name,'edge_status',e.evidence_status,'edge_confidence',e.confidence
 ) order by m.submitted_at desc),'[]'::jsonb) into v_result
 from public.afat_micro_missions m
 join public.afat_source_discrepancies d on d.id=(m.evidence->>'source_discrepancy_id')::uuid
 left join public.afat_atlas_edges e on e.id=m.target_edge_id
 where m.city=v_city.city_name and m.status='submitted' and m.evidence ? 'source_discrepancy_id';
 return v_result;
end;$$;

create or replace function public.afat_review_source_mission(p_mission_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=(select auth.uid());v_mission public.afat_micro_missions%rowtype;
 v_discrepancy public.afat_source_discrepancies%rowtype;v_edge public.afat_atlas_edges%rowtype;
 v_distinct_verified integer:=0;v_new_edge_status text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Map evidence review permission required'; end if;
 if lower(p_decision) not in('accept','reject') then raise exception 'Decision must be accept or reject'; end if;

 select * into v_mission from public.afat_micro_missions
 where id=p_mission_id and status='submitted' and evidence ? 'source_discrepancy_id' for update;
 if not found then raise exception 'Submitted source mission not found'; end if;
 select * into v_discrepancy from public.afat_source_discrepancies
 where id=(v_mission.evidence->>'source_discrepancy_id')::uuid for update;
 if not found then raise exception 'Source discrepancy not found'; end if;

 if lower(p_decision)='reject' then
   update public.afat_micro_missions set status='cancelled',
     evidence=evidence||jsonb_build_object('review',jsonb_build_object('decision','reject','reviewed_by',v_uid,'reviewed_at',now(),'notes',p_notes)),
     updated_at=now() where id=p_mission_id;
   update public.afat_source_discrepancies set status='open',
     uncertainty=least(100,greatest(uncertainty,90)),information_value=least(100,greatest(information_value,70)),
     evidence=evidence||jsonb_build_object('last_review',jsonb_build_object('mission_id',p_mission_id,'decision','reject','reviewed_by',v_uid,'reviewed_at',now(),'notes',p_notes)),
     updated_at=now() where id=v_discrepancy.id;
   return jsonb_build_object('mission_id',p_mission_id,'decision','reject','discrepancy_status','open');
 end if;

 update public.afat_micro_missions set status='verified',
   evidence=evidence||jsonb_build_object('review',jsonb_build_object('decision','accept','reviewed_by',v_uid,'reviewed_at',now(),'notes',p_notes)),
   updated_at=now() where id=p_mission_id returning * into v_mission;

 if v_mission.target_edge_id is not null then
   select * into v_edge from public.afat_atlas_edges where id=v_mission.target_edge_id for update;
   select count(distinct claimed_by)::int into v_distinct_verified from public.afat_micro_missions
   where target_edge_id=v_mission.target_edge_id and status='verified' and evidence ? 'source_discrepancy_id' and claimed_by is not null;
   v_new_edge_status:=v_edge.evidence_status;
   if v_edge.evidence_status='provisional' then
     v_new_edge_status:='corroborated';
     update public.afat_atlas_edges set evidence_status='corroborated',confidence=greatest(coalesce(confidence,0),65),last_observed_at=now(),updated_at=now() where id=v_edge.id;
   elsif v_edge.evidence_status='corroborated' and v_distinct_verified>=2 then
     v_new_edge_status:='verified';
     update public.afat_atlas_edges set evidence_status='verified',confidence=greatest(coalesce(confidence,0),82),last_observed_at=now(),last_verified_at=now(),updated_at=now() where id=v_edge.id;
   end if;
 else v_new_edge_status:=null;
 end if;

 update public.afat_source_discrepancies
 set status=case when v_new_edge_status='verified' or target_edge_id is null then 'resolved' else 'open' end,
     uncertainty=case when v_new_edge_status='verified' then 20 when v_new_edge_status='corroborated' then 45 else greatest(25,uncertainty-20) end,
     information_value=case when v_new_edge_status='verified' then 20 when v_new_edge_status='corroborated' then 52 else greatest(25,information_value-15) end,
     resolved_at=case when v_new_edge_status='verified' or target_edge_id is null then now() else null end,
     evidence=evidence||jsonb_build_object('last_review',jsonb_build_object('mission_id',p_mission_id,'decision','accept','reviewed_by',v_uid,'reviewed_at',now(),'notes',p_notes),'verified_contributors',v_distinct_verified,'edge_status_after_review',v_new_edge_status),
     updated_at=now()
 where id=v_discrepancy.id;

 return jsonb_build_object('mission_id',p_mission_id,'decision','accept','verified_contributors',v_distinct_verified,'edge_status',v_new_edge_status,'discrepancy_status',case when v_new_edge_status='verified' or v_mission.target_edge_id is null then 'resolved' else 'open' end);
end;$$;

revoke all on function public.afat_source_mission_submission_bridge() from public,anon,authenticated;
revoke all on function public.afat_source_mission_review_queue(text) from public,anon;
revoke all on function public.afat_review_source_mission(uuid,text,text) from public,anon;
grant execute on function public.afat_source_mission_review_queue(text) to authenticated;
grant execute on function public.afat_review_source_mission(uuid,text,text) to authenticated;