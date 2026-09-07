create unique index if not exists afat_atlas_system_observation_idempotency_uidx
  on public.afat_atlas_observations(idempotency_key)
  where idempotency_key is not null and source_kind='system';

create or replace function public.afat_sync_verified_incident_to_atlas()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_edge_id uuid;
  v_key text := 'incident:' || new.id::text || ':atlas';
  v_confidence numeric := greatest(0,least(100,coalesce(new.confidence_score,50)))::numeric;
  v_point public.geography;
begin
  if lower(coalesce(new.verification_status,'')) not in ('verified','corroborated')
     or lower(coalesce(new.status,'')) in ('resolved','dismissed','false','cancelled')
     or new.expires_at <= now() then
    update public.afat_atlas_observations
    set expires_at=least(coalesce(expires_at,now()),now()),
        observed_at=now(),
        observation_value=observation_value || jsonb_build_object(
          'incident_status',new.status,
          'verification_status',new.verification_status,
          'active',false
        )
    where source_kind='system' and idempotency_key=v_key;
    return new;
  end if;

  v_point := public.ST_SetSRID(public.ST_MakePoint(new.longitude,new.latitude),4326)::public.geography;

  select e.id into v_edge_id
  from public.afat_atlas_edges e
  where e.status='active'
    and e.evidence_status in ('corroborated','verified')
    and public.ST_DWithin(e.geometry,v_point,200)
  order by public.ST_Distance(e.geometry,v_point), e.confidence desc
  limit 1;

  if v_edge_id is null then
    return new;
  end if;

  insert into public.afat_atlas_observations(
    atlas_edge_id,observer_id,observation_type,observation_value,source_kind,
    confidence,evidence,idempotency_key,observed_at,expires_at
  ) values (
    v_edge_id,
    new.reporter_id,
    'verified_incident',
    jsonb_build_object(
      'incident_id',new.id,
      'incident_type',new.type,
      'severity',new.severity,
      'incident_status',new.status,
      'verification_status',new.verification_status,
      'active',true
    ),
    'system',
    v_confidence,
    jsonb_build_object(
      'incident_id',new.id,
      'confirmations',coalesce(new.confirmations,0),
      'has_photo',(new.photo_url is not null or new.photo_file_id is not null),
      'has_voice',(new.voice_url is not null or new.voice_file_id is not null),
      'source',coalesce(new.source,'unknown'),
      'bridge','incident_to_atlas_nearest_verified_edge',
      'attachment_radius_m',200
    ),
    v_key,
    now(),
    new.expires_at
  )
  on conflict (idempotency_key) where idempotency_key is not null and source_kind='system'
  do update set
    atlas_edge_id=excluded.atlas_edge_id,
    observer_id=excluded.observer_id,
    observation_type=excluded.observation_type,
    observation_value=excluded.observation_value,
    confidence=excluded.confidence,
    evidence=excluded.evidence,
    observed_at=excluded.observed_at,
    expires_at=excluded.expires_at;

  return new;
end;
$$;

revoke all on function public.afat_sync_verified_incident_to_atlas() from public, anon, authenticated;

drop trigger if exists afat_verified_incident_atlas_sync on public.incidents;
create trigger afat_verified_incident_atlas_sync
after insert or update of verification_status,status,confidence_score,expires_at on public.incidents
for each row execute function public.afat_sync_verified_incident_to_atlas();
