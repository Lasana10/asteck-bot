-- AFAT end-to-end journey replay: same contributor + same device-start key is one
-- server session, even after timeout, reconnect or lost acknowledgement.
alter table public.afat_navigation_sessions
  add column if not exists client_start_key uuid,
  add column if not exists client_start_fingerprint text;
create unique index if not exists afat_navigation_session_start_once_idx
  on public.afat_navigation_sessions(profile_id,client_start_key)
  where client_start_key is not null;

create or replace function public.afat_start_navigation_session_once(
 p_city_key text, p_place_id uuid, p_access_point_id uuid,
 p_meeting_point_id uuid, p_intent_type text, p_movement_mode text,
 p_destination_latitude double precision, p_destination_longitude double precision,
 p_route_distance_m numeric, p_client_start_key uuid
) returns jsonb
language plpgsql security definer
set search_path = 'pg_catalog','public','extensions'
as $$
declare
 v_uid uuid := auth.uid();
 v_fingerprint text;
 v_row public.afat_navigation_sessions%rowtype;
 v_id uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_client_start_key is null then raise exception 'A client start key is required'; end if;
 -- Identical argument sets have an identical fingerprint even when retried.
 v_fingerprint:=md5(jsonb_build_object('city_key',p_city_key,'place_id',p_place_id,
    'access_point_id',p_access_point_id,'meeting_point_id',p_meeting_point_id,
    'intent_type',p_intent_type,'movement_mode',p_movement_mode,
    'destination_latitude',p_destination_latitude,'destination_longitude',p_destination_longitude,
    'route_distance_m',p_route_distance_m)::text);
 -- Serialize concurrently arriving retries for one authenticated account.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
 select * into v_row from public.afat_navigation_sessions
   where profile_id=v_uid and client_start_key=p_client_start_key;
 if found then
   if v_row.client_start_fingerprint is distinct from v_fingerprint then
     raise exception 'Start key reused with different journey';
   end if;
   return to_jsonb(v_row)||jsonb_build_object('replayed',true);
 end if;
 -- Existing function owns all destination/mode validation and lifecycle changes.
 select (public.afat_start_navigation_session(
   p_city_key,p_place_id,p_access_point_id,p_meeting_point_id,p_intent_type,
   p_movement_mode,p_destination_latitude,p_destination_longitude,p_route_distance_m)->>'id')::uuid into v_id;
 update public.afat_navigation_sessions
 set client_start_key=p_client_start_key,client_start_fingerprint=v_fingerprint
 where id=v_id and profile_id=v_uid returning * into v_row;
 if not found then raise exception 'Navigation start receipt was not persisted'; end if;
 return to_jsonb(v_row)||jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.afat_start_navigation_session_once(text,uuid,uuid,uuid,text,text,double precision,double precision,numeric,uuid) from public,anon;
grant execute on function public.afat_start_navigation_session_once(text,uuid,uuid,uuid,text,text,double precision,double precision,numeric,uuid) to authenticated;
