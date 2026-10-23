-- Atlas city-bound trace truth:
-- A city-labelled movement observation must sit fully inside its ACTIVE
-- profile's already-reviewed working envelope, accounting for GNSS uncertainty.
-- This uses the existing afat_city_profiles metadata; no synthetic boundaries,
-- city activation, new providers or user records are created.
-- Legacy sessions without city_profile_id keep their original contract.
create or replace function public.afat_validate_city_contribution_sample()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_city public.afat_city_profiles%rowtype;
  v_envelope jsonb;
  v_south double precision;
  v_north double precision;
  v_west double precision;
  v_east double precision;
  v_lat_pad double precision;
  v_lon_pad double precision;
  v_session public.afat_contribution_sessions%rowtype;
begin
  select * into v_session from public.afat_contribution_sessions
    where id=new.session_id;
  if not found then
    raise exception 'ATLAS_CONTRIBUTION_SESSION_UNKNOWN' using errcode='23503';
  end if;
  if v_session.city_profile_id is null then
    return new; -- preserve explicit legacy contribution semantics
  end if;
  select * into v_city from public.afat_city_profiles
    where id=v_session.city_profile_id and status='active';
  if not found then
    raise exception 'ATLAS_CITY_NOT_ACTIVE' using errcode='22023';
  end if;
  if new.latitude is null or new.longitude is null
     or new.accuracy_m is null or new.accuracy_m < 0 or new.accuracy_m > 120
     or new.latitude not between -90 and 90 or new.longitude not between -180 and 180 then
    raise exception 'ATLAS_CITY_GPS_UNCERTAIN' using errcode='22023';
  end if;
  if new.recorded_at > now() + interval '5 minutes' then
    raise exception 'ATLAS_CITY_GPS_FUTURE' using errcode='22023';
  end if;
  v_envelope := v_city.metadata->'coverage_working_envelope';
  if v_envelope is null
     or jsonb_typeof(v_envelope->'south') <> 'number'
     or jsonb_typeof(v_envelope->'north') <> 'number'
     or jsonb_typeof(v_envelope->'west') <> 'number'
     or jsonb_typeof(v_envelope->'east') <> 'number' then
    raise exception 'ATLAS_CITY_COVERAGE_UNCONFIGURED' using errcode='22023';
  end if;
  v_south := (v_envelope->>'south')::double precision;
  v_north := (v_envelope->>'north')::double precision;
  v_west := (v_envelope->>'west')::double precision;
  v_east := (v_envelope->>'east')::double precision;
  if not(v_south<v_north and v_west<v_east) then
    raise exception 'ATLAS_CITY_COVERAGE_INVALID' using errcode='22023';
  end if;
  v_lat_pad := new.accuracy_m::double precision/111320.0;
  v_lon_pad := new.accuracy_m::double precision/
     greatest(1.0,111320.0*abs(cos(radians(new.latitude))));
  if new.latitude-v_lat_pad < v_south or new.latitude+v_lat_pad > v_north
     or new.longitude-v_lon_pad < v_west or new.longitude+v_lon_pad > v_east then
    raise exception 'ATLAS_CITY_OBSERVATION_OUTSIDE_COVERAGE' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.afat_validate_city_contribution_sample() from public,anon,authenticated;
drop trigger if exists afat_check_city_contribution_sample on public.afat_contribution_samples;
create trigger afat_check_city_contribution_sample
before insert or update of latitude,longitude,accuracy_m,recorded_at,session_id
on public.afat_contribution_samples
for each row execute function public.afat_validate_city_contribution_sample();
comment on function public.afat_validate_city_contribution_sample() is
'Protects existing city-labelled Atlas movement from wrong-city or unmeasured fixes. Active working envelope only, not jurisdiction proof.';
