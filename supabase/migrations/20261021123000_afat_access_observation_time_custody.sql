-- AFAT access observation custody. Existing authenticated/idempotent RPC preserved.
-- Capture times remain unverified device claims pending human review.
CREATE OR REPLACE FUNCTION public.afat_submit_mobility_evidence_once(p_kind text, p_payload jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_fingerprint text;
  v_inserted bigint := 0;
  v_saved public.afat_mobility_evidence_receipts%rowtype;
  v_result jsonb;
  v_reported_capture timestamptz;
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
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
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
  -- Device-reported GNSS capture time is review metadata, not verified truth.
  if p_kind = 'access' and nullif(p_payload->>'p_observed_at','') is not null then
    begin
      v_reported_capture := (p_payload->>'p_observed_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Invalid device observation timestamp';
    end;
    if not isfinite(v_reported_capture) or v_reported_capture > now() + interval '5 minutes'
       or v_reported_capture < now() - interval '72 hours' then
      raise exception 'Device observation timestamp is outside the permitted replay window';
    end if;
    update public.afat_access_evidence_submissions
       set evidence = coalesce(evidence,'{}'::jsonb) ||
          jsonb_build_object('observed_at',v_reported_capture,
            'observation_time_source','device_reported_gnss',
            'observation_time_verified',false,'automatic_truth',false)
     where id = (v_result->>'id')::uuid
       and profile_id = v_uid and status = 'pending';
    if not found then raise exception 'Access evidence record not available for observation timestamp'; end if;
  end if;
  update public.afat_mobility_evidence_receipts set outcome=v_result
    where contributor_id=v_uid and observation_key=p_idempotency_key;
  return v_result || jsonb_build_object('replayed',false);
end;
$function$

