-- AFAT offline mobility evidence exact replay, contributor scoped.
-- Authenticated users can call the RPC, but cannot read/write its private receipt table.
create table if not exists public.afat_mobility_evidence_receipts (
  contributor_id uuid not null,
  observation_key uuid not null,
  request_fingerprint text not null,
  outcome jsonb,
  created_at timestamptz not null default now(),
  primary key (contributor_id, observation_key)
);
alter table public.afat_mobility_evidence_receipts enable row level security;
revoke all on public.afat_mobility_evidence_receipts from public, anon, authenticated;

create or replace function public.afat_submit_mobility_evidence_once(
  p_kind text, p_payload jsonb, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_fingerprint text;
  v_claimed boolean := false;
  v_saved public.afat_mobility_evidence_receipts%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if p_kind not in ('access','transit','gap') or p_payload is null or jsonb_typeof(p_payload) <> 'object'
  then raise exception 'Unsupported mobility evidence request'; end if;
  if length(p_payload::text) > 16384 then raise exception 'Evidence payload too large'; end if;

  v_fingerprint := md5(jsonb_build_object('kind',p_kind,'payload',p_payload)::text);
  insert into public.afat_mobility_evidence_receipts(contributor_id,observation_key,request_fingerprint)
    values(v_uid,p_idempotency_key,v_fingerprint)
    on conflict do nothing;
  get diagnostics v_claimed = row_count;
  if not v_claimed then
    select * into v_saved from public.afat_mobility_evidence_receipts
    where contributor_id=v_uid and observation_key=p_idempotency_key;
    if not found or v_saved.request_fingerprint is distinct from v_fingerprint
      then raise exception 'Idempotency key reused with different evidence'; end if;
    if v_saved.outcome is null then raise exception 'Evidence receipt is not ready'; end if;
    return v_saved.outcome || jsonb_build_object('replayed',true);
  end if;

  if p_kind='access' then
    v_result:=public.afat_submit_access_evidence(
      (p_payload->>'p_place_id')::uuid,
      p_payload->>'p_access_type',
      (p_payload->>'p_latitude')::double precision,
      (p_payload->>'p_longitude')::double precision,
      p_payload->>'p_name',
      p_payload->>'p_instructions',
      coalesce(array(select jsonb_array_elements_text(p_payload->'p_access_modes')), '{}'::text[]),
      (p_payload->>'p_gps_accuracy_m')::numeric,
      p_payload->>'p_photo_url'
    );
  elsif p_kind='transit' then
    v_result:=public.afat_submit_transit_observation(
      p_payload->>'p_city_key', p_payload->>'p_observation_type',
      p_payload->>'p_node_name', p_payload->>'p_line_name',
      p_payload->>'p_direction_label', p_payload->>'p_mode',
      (p_payload->>'p_latitude')::double precision,
      (p_payload->>'p_longitude')::double precision,
      (p_payload->>'p_wait_seconds')::integer,
      (p_payload->>'p_travel_seconds')::integer,
      (p_payload->>'p_fare_xaf')::integer,
      (p_payload->>'p_gps_accuracy_m')::numeric,
      coalesce(p_payload->'p_evidence','{}'::jsonb)
    );
  else
    v_result:=public.afat_record_mobility_gap(
      p_payload->>'p_city_key',p_payload->>'p_signal_type',
      p_payload->>'p_label',(p_payload->>'p_place_id')::uuid,
      p_payload->>'p_mode',(p_payload->>'p_latitude')::double precision,
      (p_payload->>'p_longitude')::double precision,
      coalesce(p_payload->'p_metadata','{}'::jsonb)
    );
  end if;
  if v_result is null then raise exception 'Evidence submission returned no receipt'; end if;
  update public.afat_mobility_evidence_receipts set outcome=v_result
    where contributor_id=v_uid and observation_key=p_idempotency_key;
  return v_result || jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.afat_submit_mobility_evidence_once(text,jsonb,uuid) from public, anon;
grant execute on function public.afat_submit_mobility_evidence_once(text,jsonb,uuid) to authenticated;
