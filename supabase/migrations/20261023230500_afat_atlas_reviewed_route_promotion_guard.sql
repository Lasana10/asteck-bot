-- Reviewed route geometry remains separate from crowd-sourced candidate hypotheses.
-- Enforce evidence gates in the database, not merely in planner UI.
create or replace function public.afat_guard_atlas_candidate_review()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status
    and new.status in ('corroborated','trusted','rejected') then
  if new.reviewed_by is null or new.reviewed_at is null or
    char_length(trim(coalesce(new.review_notes,'')))<25 then
   raise exception 'ATLAS_REVIEW_REQUIRES_WRITTEN_EVIDENCE' using errcode='22023';
  end if;
 end if;
 if new.status='trusted' and old.status is distinct from 'trusted' and
   (coalesce(new.unique_contributors,0)<3 or coalesce(new.evidence_count,0)<5
    or coalesce(new.confidence,0)<70 or new.city_profile_id is null) then
   raise exception 'ATLAS_TRUST_REQUIRES_INDEPENDENT_CORROBORATION_AND_CITY' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists afat_guard_candidate_review on public.afat_candidate_features;
create trigger afat_guard_candidate_review
 before update of status,review_notes,reviewed_by,reviewed_at
 on public.afat_candidate_features
 for each row execute function public.afat_guard_atlas_candidate_review();

-- Existing promotion inserts an edge with restrictions.candidate_feature_id.
-- Validate source-city custody and independent contributors BEFORE it is routable.
create or replace function public.afat_guard_promoted_atlas_edge()
returns trigger language plpgsql set search_path='' as $$
declare c public.afat_candidate_features%rowtype;
        city public.afat_city_profiles%rowtype;
        candidate_id uuid;
        start_point public.geometry;
        end_point public.geometry;
begin
 if not (new.restrictions ? 'candidate_feature_id') then return new;end if;
 if (new.restrictions->>'candidate_feature_id') !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise exception 'ATLAS_PROMOTION_SOURCE_ID_INVALID' using errcode='22023';end if;
 candidate_id := (new.restrictions->>'candidate_feature_id')::uuid;
 select * into c from public.afat_candidate_features where id=candidate_id for update;
 if not found or c.status<>'trusted' or c.city_profile_id is null or
    coalesce(c.unique_contributors,0)<3 or coalesce(c.evidence_count,0)<5
    or coalesce(c.confidence,0)<70 or
    char_length(trim(coalesce(c.review_notes,'')))<25 or c.reviewed_by is null then
  raise exception 'ATLAS_UNCORROBORATED_CANDIDATE_CANNOT_ENTER_ROUTING' using errcode='22023';
 end if;
 select * into city from public.afat_city_profiles where id=c.city_profile_id
   and status='active';
 if not found then raise exception 'ATLAS_PROMOTION_CITY_NOT_ACTIVE' using errcode='22023';end if;
 if not public.st_dwithin(new.geometry,c.geometry,5)
    or abs(public.st_length(new.geometry)-public.st_length(c.geometry))>5 then
  raise exception 'ATLAS_PROMOTION_GEOMETRY_MISMATCH' using errcode='22023';
 end if;
 start_point := public.st_startpoint(new.geometry::public.geometry);
 end_point := public.st_endpoint(new.geometry::public.geometry);
 if start_point is null or end_point is null then
  raise exception 'ATLAS_PROMOTION_GEOMETRY_INVALID' using errcode='22023';
 end if;
 -- Promotion produces corroborated geography only, never verified passability.
 if new.passability is distinct from 'unknown' then
  raise exception 'ATLAS_UNVERIFIED_PASSABILITY' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists afat_guard_promoted_atlas_edge on public.afat_atlas_edges;
create trigger afat_guard_promoted_atlas_edge
 before insert on public.afat_atlas_edges
 for each row execute function public.afat_guard_promoted_atlas_edge();

-- Staff-facing preview returns the real candidate city without allowing
-- the caller to choose a convenient fallback jurisdiction.
create or replace function public.afat_candidate_promotion_readiness(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.afat_candidate_features%rowtype;
        city public.afat_city_profiles%rowtype;
        reasons text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.afat_has_permission('map.evidence.review') then
  raise exception 'ATLAS_REVIEW_PERMISSION_REQUIRED' using errcode='42501';end if;
 select * into c from public.afat_candidate_features where id=p_candidate_id;
 if not found then raise exception 'ATLAS_CANDIDATE_NOT_FOUND' using errcode='P0002';end if;
 select * into city from public.afat_city_profiles where id=c.city_profile_id and status='active';
 if not found then reasons:=array_append(reasons,'no_active_attributed_city');end if;
 if c.status<>'trusted' then reasons:=array_append(reasons,'not_trusted');end if;
 if c.feature_type not in ('road_segment','path') then reasons:=array_append(reasons,'not_route_geometry');end if;
 if coalesce(c.unique_contributors,0)<3 then reasons:=array_append(reasons,'independent_contributors_below_3');end if;
 if coalesce(c.evidence_count,0)<5 then reasons:=array_append(reasons,'evidence_observations_below_5');end if;
 if coalesce(c.confidence,0)<70 then reasons:=array_append(reasons,'confidence_below_70');end if;
 if char_length(trim(coalesce(c.review_notes,'')))<25 or c.reviewed_by is null then
  reasons:=array_append(reasons,'review_rationale_missing');end if;
 return jsonb_build_object('candidate_id',c.id,'city_key',city.city_key,
   'status',c.status,'ready',cardinality(reasons)=0,
   'blockers',to_jsonb(reasons),'independent_contributors',c.unique_contributors,
   'evidence_count',c.evidence_count,'confidence',c.confidence,
   'route_passability_verified',false);
end $$;
revoke all on function public.afat_candidate_promotion_readiness(uuid) from public,anon;
grant execute on function public.afat_candidate_promotion_readiness(uuid) to authenticated,service_role;
