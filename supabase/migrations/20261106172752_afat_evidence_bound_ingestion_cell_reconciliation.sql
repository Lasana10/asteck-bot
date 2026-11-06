-- Applied AFAT production migration 20261106172752.
-- Evidence-bound reconciliation of stalled OSM import cells.
CREATE OR REPLACE FUNCTION public.afat_reconcile_ingestion_cell(p_cell_id uuid, p_import_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_cell public.afat_city_ingestion_cells%rowtype;
  v_batch public.afat_geo_import_batches%rowtype;
  v_city_key text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or
          public.afat_has_permission('system.configure')) then
    raise exception 'City source reconciliation permission required';
  end if;
  if p_cell_id is null or p_import_batch_id is null then
    raise exception 'Exact cell and persisted import batch IDs are required';
  end if;
  select * into v_cell from public.afat_city_ingestion_cells
    where id=p_cell_id for update;
  if not found then raise exception 'Ingestion cell not found'; end if;
  if v_cell.status <> 'running' or v_cell.started_at is null then
    raise exception 'Only a running ingestion cell can be reconciled';
  end if;
  if v_cell.started_at > now() - interval '10 minutes' then
    raise exception 'Allow the original ingestion request to finish before reconciliation';
  end if;
  select city_key into v_city_key from public.afat_city_profiles
    where id=v_cell.city_profile_id;
  if v_city_key is null then raise exception 'Source city identity missing'; end if;
  select * into v_batch from public.afat_geo_import_batches
    where id=p_import_batch_id for share;
  if not found then raise exception 'Persisted import batch not found'; end if;
  if v_batch.status not in ('completed','completed_with_errors')
    or v_batch.finished_at is null
    or v_batch.source_key is distinct from v_cell.source_key
    or v_batch.import_mode <> 'candidate_only'
    or v_batch.requested_by is distinct from v_cell.requested_by
    or v_batch.created_at < v_cell.started_at - interval '1 minute'
    or v_batch.scope_bbox->>'city_key' is distinct from v_city_key
    or coalesce(abs((v_batch.scope_bbox->>'south')::double precision-v_cell.south),999)>0.0000001
    or coalesce(abs((v_batch.scope_bbox->>'north')::double precision-v_cell.north),999)>0.0000001
    or coalesce(abs((v_batch.scope_bbox->>'west')::double precision-v_cell.west),999)>0.0000001
    or coalesce(abs((v_batch.scope_bbox->>'east')::double precision-v_cell.east),999)>0.0000001
    or v_batch.input_count is distinct from
       (coalesce(v_batch.inserted_count,0)+coalesce(v_batch.rejected_count,0))
  then
    raise exception 'Import receipt is not a matching, completed, candidate-only source batch';
  end if;
  if exists (select 1 from public.afat_city_ingestion_cells c
             where c.import_batch_id=v_batch.id and c.id<>v_cell.id) then
    raise exception 'Import receipt is already assigned to another city cell';
  end if;
  update public.afat_city_ingestion_cells
    set status=v_batch.status,
        import_batch_id=v_batch.id,
        last_error=v_batch.error_summary,
        result=jsonb_build_object(
          'candidate_only',true,
          'reconciled_from_persisted_batch',true,
          'reconciled_by',v_uid,
          'reconciled_at',now(),
          'automatic_truth',false,
          'import_batch_id',v_batch.id,
          'accepted',coalesce(v_batch.inserted_count,0),
          'rejected',coalesce(v_batch.rejected_count,0)
        ),
        finished_at=now(),updated_at=now()
    where id=v_cell.id and status='running'
    returning * into v_cell;
  if not found then raise exception 'Running cell changed while reconciling'; end if;
  return jsonb_build_object(
    'status',v_cell.status,'cell_id',v_cell.id,
    'import_batch_id',v_batch.id,'candidate_only',true,
    'reconciled_from_persisted_batch',true,'automatic_truth',false
  );
end
$function$

revoke all on function public.afat_reconcile_ingestion_cell(uuid,uuid) from public,anon,authenticated;
grant execute on function public.afat_reconcile_ingestion_cell(uuid,uuid) to authenticated;
