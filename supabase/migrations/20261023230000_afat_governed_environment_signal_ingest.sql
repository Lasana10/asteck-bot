-- Environmental evidence is not an observed street hazard or a verified route.
-- Enforce source rights and active city coverage below the edge function so
-- direct RPC callers cannot bypass this data-custody boundary.
create or replace function public.afat_guard_environment_source_evidence()
returns trigger language plpgsql set search_path='' as $$
declare v_source public.afat_geo_sources%rowtype;
 v_city public.afat_city_profiles%rowtype;
 v_box jsonb; v_lat double precision;v_lon double precision;
begin
 select * into v_source from public.afat_geo_sources where source_key=new.source_key;
 if not found or v_source.enabled is distinct from true or
   v_source.commercial_use_reviewed is distinct from true then
  raise exception 'AFAT_ENVIRONMENT_SOURCE_NOT_LICENSED_OR_ACTIVE' using errcode='22023';
 end if;
 select * into v_city from public.afat_city_profiles where id=new.city_profile_id and status='active';
 if not found then raise exception 'AFAT_ENVIRONMENT_CITY_INACTIVE' using errcode='22023';end if;
 v_box:=v_city.metadata->'coverage_working_envelope';
 if v_box is null or jsonb_typeof(v_box->'south')<>'number'
  or jsonb_typeof(v_box->'north')<>'number' or jsonb_typeof(v_box->'west')<>'number'
  or jsonb_typeof(v_box->'east')<>'number'
 then raise exception 'AFAT_ENVIRONMENT_CITY_COVERAGE_UNKNOWN' using errcode='22023';end if;
 v_lat:=public.st_y(new.location::public.geometry);
 v_lon:=public.st_x(new.location::public.geometry);
 if v_lat < (v_box->>'south')::double precision
   or v_lat > (v_box->>'north')::double precision
   or v_lon < (v_box->>'west')::double precision
   or v_lon > (v_box->>'east')::double precision
 then raise exception 'AFAT_ENVIRONMENT_OUTSIDE_WORKING_CITY' using errcode='22023';end if;
 if new.observed_at > now()+interval '5 minutes'
   or new.observed_at < now()-interval '5 years'
   or (new.expires_at is not null and new.expires_at<=new.observed_at)
 then raise exception 'AFAT_ENVIRONMENT_OBSERVATION_TIME_INVALID' using errcode='22023';end if;
 if nullif(trim(new.provenance->>'dataset_id'),'') is null
   or nullif(trim(new.provenance->>'dataset_url'),'') is null
   or new.provenance->>'automatic_truth' is distinct from 'false'
 then raise exception 'AFAT_ENVIRONMENT_SOURCE_PROVENANCE_REQUIRED' using errcode='22023';end if;
 if new.provenance->>'dataset_url' !~* '^https://[^[:space:]]+$'
 then raise exception 'AFAT_ENVIRONMENT_DATASET_LINK_INVALID' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists afat_guard_environment_source_evidence_trigger on public.afat_environment_signals;
create trigger afat_guard_environment_source_evidence_trigger
before insert or update of source_key,city_profile_id,location,observed_at,expires_at,provenance
on public.afat_environment_signals
for each row execute function public.afat_guard_environment_source_evidence();
