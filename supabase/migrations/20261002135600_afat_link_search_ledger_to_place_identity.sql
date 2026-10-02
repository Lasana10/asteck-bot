insert into public.afat_places(
  id,canonical_name,aliases,description,city,zone_label,latitude,longitude,location,
  place_type,vehicle_access,base_confidence,successful_pickups,failed_pickups,status,
  primary_source_key,evidence_status,place_ref,destination_kind,reachability_state,metadata
)
select
  l.id,l.canonical_label,coalesce(l.aliases,'{}'::text[]),l.description,l.city,l.zone_label,l.latitude,l.longitude,
  ST_SetSRID(ST_MakePoint(l.longitude,l.latitude),4326)::geography,
  case when l.address_type='road' then 'road' else 'locality' end,
  'unknown',least(75,greatest(35,round(l.confidence)::int)),0,0,'unverified',
  case
    when (l.metadata->'source_keys') ? 'openstreetmap' then 'openstreetmap'
    else 'overture_maps'
  end,
  'limited',
  'AFAT-SEARCH-'||upper(substr(md5(l.id::text),1,12)),
  case when l.address_type='road' then 'other' else 'landmark' end,
  'learning',
  coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
    'search_anchor_only',true,
    'automatic_truth',false,
    'ledger_id',l.id,
    'ledger_source',l.source,
    'address_type',l.address_type
  )
from public.afat_address_ledger l
where l.status in ('candidate','verified')
  and l.latitude is not null and l.longitude is not null
  and not exists (select 1 from public.afat_places p where p.id=l.id)
  and not exists (
    select 1 from public.afat_places p
    where lower(p.city)=lower(l.city)
      and lower(p.canonical_name)=lower(l.canonical_label)
      and ST_DWithin(
        coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
        ST_SetSRID(ST_MakePoint(l.longitude,l.latitude),4326)::geography,
        80
      )
      and p.status<>'retired'
  );

update public.afat_address_ledger l
set place_id=p.id,updated_at=now()
from public.afat_places p
where l.place_id is null
  and lower(p.city)=lower(l.city)
  and lower(p.canonical_name)=lower(l.canonical_label)
  and ST_DWithin(
    coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
    ST_SetSRID(ST_MakePoint(l.longitude,l.latitude),4326)::geography,
    80
  );
