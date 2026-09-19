-- Source-controlled copy of production migration 20260919215804

create or replace function public.afat_report_nearby_road_condition(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_condition text,
  p_mode text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_point public.geography;
  v_edge_id uuid;
  v_edge_name text;
  v_distance numeric;
  v_confidence numeric;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('report.create') then raise exception 'Reporting permission required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if p_accuracy_m is null or p_accuracy_m>120 then raise exception 'Location accuracy is too weak for a road condition report'; end if;
  if p_condition not in ('open','slow','blocked','damaged','flooded','unsafe','unknown') then raise exception 'Unsupported condition'; end if;

  v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;

  select e.id,coalesce(e.canonical_name,'Unnamed road'),public.st_distance(e.geometry,v_point)
  into v_edge_id,v_edge_name,v_distance
  from public.afat_atlas_edges e
  where e.status='active'
    and public.st_dwithin(e.geometry,v_point,greatest(40,least(150,p_accuracy_m+45)))
  order by e.geometry <-> v_point
  limit 1;

  if v_edge_id is null then
    raise exception 'No AFAT road is close enough to attach this report. Use movement contribution to help map this area.';
  end if;

  v_confidence:=case when p_accuracy_m<=20 then 0.72 when p_accuracy_m<=50 then 0.62 else 0.5 end;

  v_result:=public.afat_record_edge_condition(
    v_edge_id,p_condition,p_mode,v_confidence,
    jsonb_build_object(
      'latitude',p_latitude,'longitude',p_longitude,'accuracy_m',p_accuracy_m,
      'notes',nullif(trim(coalesce(p_notes,'')),'')
    )::text
  );

  return v_result||jsonb_build_object(
    'edge_name',v_edge_name,
    'distance_to_edge_m',round(v_distance,1),
    'accuracy_m',p_accuracy_m
  );
end; $$;

create or replace function public.afat_contribution_reputation_after_complete()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_completed integer;
  v_distance numeric;
  v_corroborated integer;
  v_rejected integer;
  v_score numeric;
  v_level text;
begin
  if new.status='completed' and old.status is distinct from new.status then
    select count(*),coalesce(sum(distance_m),0)
    into v_completed,v_distance
    from public.afat_contribution_sessions
    where contributor_id=new.contributor_id and status='completed';

    select count(*) filter(where c.status in ('corroborated','trusted','merged')),
           count(*) filter(where c.status='rejected')
    into v_corroborated,v_rejected
    from public.afat_candidate_features c
    join public.afat_contribution_sessions s on s.id=c.source_session_id
    where s.contributor_id=new.contributor_id;

    v_score:=greatest(0,least(100,
      45+least(20,v_completed*1.5)+least(25,v_corroborated*4)+least(10,v_distance/10000)-least(35,v_rejected*7)
    ));
    v_level:=case
      when v_score>=90 and v_corroborated>=20 then 'steward'
      when v_score>=75 and v_corroborated>=8 then 'trusted'
      when v_score>=58 and v_completed>=5 then 'regular'
      else 'new' end;

    insert into public.afat_contributor_reputation(
      profile_id,reputation_score,trust_level,completed_sessions,corroborated_contributions,
      rejected_contributions,verified_distance_m,last_contribution_at,updated_at
    ) values (
      new.contributor_id,v_score,v_level,v_completed,v_corroborated,v_rejected,v_distance,new.ended_at,now()
    )
    on conflict(profile_id) do update set
      reputation_score=excluded.reputation_score,trust_level=excluded.trust_level,
      completed_sessions=excluded.completed_sessions,corroborated_contributions=excluded.corroborated_contributions,
      rejected_contributions=excluded.rejected_contributions,verified_distance_m=excluded.verified_distance_m,
      last_contribution_at=excluded.last_contribution_at,updated_at=now();
  end if;
  return new;
end; $$;

drop trigger if exists afat_contribution_reputation_refresh on public.afat_contribution_sessions;
create trigger afat_contribution_reputation_refresh
after update of status on public.afat_contribution_sessions
for each row execute function public.afat_contribution_reputation_after_complete();

revoke all on function public.afat_report_nearby_road_condition(double precision,double precision,numeric,text,text,text) from public,anon;
grant execute on function public.afat_report_nearby_road_condition(double precision,double precision,numeric,text,text,text) to authenticated;
revoke all on function public.afat_contribution_reputation_after_complete() from public,anon,authenticated;

