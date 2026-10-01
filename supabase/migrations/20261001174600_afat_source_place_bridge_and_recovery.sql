-- Persist the source-to-place bridge and one-time Yaoundé source-backed place recovery.
create or replace function public.afat_promote_source_places(
  p_city_key text default 'cm-yaounde',
  p_limit integer default 1000
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_rec record; v_place_id uuid; v_inserted int:=0; v_linked int:=0; v_kind text; v_ref text; v_scope_prefix text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then
    raise exception 'Planning permission required';
  end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  v_scope_prefix:=translate(v_city.city_name,'éÉèÈêÊàÀùÙôÔîÎçÇ','eEeEeEaAuUoOiIcC');

  for v_rec in
    select r.*
    from public.afat_geo_source_records r
    join public.afat_geo_import_batches b on b.id=r.last_import_batch_id
    where r.source_feature_kind='point'
      and r.canonical_name is not null and btrim(r.canonical_name)<>''
      and r.latitude is not null and r.longitude is not null
      and r.review_status in ('candidate','matched')
      and r.linked_place_id is null
      and r.source_license is not null
      and b.status='completed'
      and lower(b.scope_label) like lower(v_scope_prefix)||'%'
    order by coalesce(r.source_confidence,0) desc,r.last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,1000),5000))
  loop
    select p.id into v_place_id
    from public.afat_places p
    where lower(p.city)=lower(v_city.city_name)
      and lower(p.canonical_name)=lower(v_rec.canonical_name)
      and ST_DWithin(
        coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
        coalesce(v_rec.location,ST_SetSRID(ST_MakePoint(v_rec.longitude,v_rec.latitude),4326)::geography),80)
      and p.status<>'retired'
    order by ST_Distance(
      coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
      coalesce(v_rec.location,ST_SetSRID(ST_MakePoint(v_rec.longitude,v_rec.latitude),4326)::geography))
    limit 1;

    if v_place_id is null then
      v_kind:=case
        when v_rec.source_category~*'(school|college|university|education)' then 'school'
        when v_rec.source_category~*'(hospital|clinic|pharmacy|medical|health)' then 'hospital'
        when v_rec.source_category~*'(market|supermarket|store|shop|mall)' then 'market'
        when v_rec.source_category~*'(restaurant|cafe|bar|hotel|accommodation|venue|stadium|church|mosque)' then 'venue'
        when v_rec.source_category~*'(office|government|bank|service|company|business|salon|repair|gas_station)' then 'business'
        when v_rec.source_category~*'(stop|station|transport)' then 'stop'
        else 'place'
      end;
      v_ref:='AFAT-'||upper(substr(md5(v_rec.source_key||':'||v_rec.external_feature_id),1,12));
      insert into public.afat_places(
        canonical_name,aliases,description,city,latitude,longitude,location,place_type,vehicle_access,
        base_confidence,successful_pickups,failed_pickups,status,primary_source_key,primary_source_record_id,
        evidence_status,place_ref,destination_kind,reachability_state,metadata
      ) values(
        v_rec.canonical_name,coalesce(v_rec.alternate_names,'{}'::text[]),nullif(v_rec.source_address,''),
        v_city.city_name,v_rec.latitude,v_rec.longitude,
        coalesce(v_rec.location,ST_SetSRID(ST_MakePoint(v_rec.longitude,v_rec.latitude),4326)::geography),
        coalesce(nullif(v_rec.source_category,''),'place'),'unknown',
        greatest(20,least(70,round(coalesce(v_rec.source_confidence,0.4)*70)::int)),
        0,0,'unverified',v_rec.source_key,v_rec.id,'limited',v_ref,v_kind,'learning',
        jsonb_build_object('source_category',v_rec.source_category,'source_license',v_rec.source_license,
          'attribution',v_rec.attribution_text,'source_record_id',v_rec.id,'source_only',true,'automatic_truth',false)
      ) on conflict(place_ref) do nothing
      returning id into v_place_id;
      if v_place_id is not null then v_inserted:=v_inserted+1; end if;
    else
      v_linked:=v_linked+1;
    end if;
    if v_place_id is not null then
      update public.afat_geo_source_records
      set linked_place_id=v_place_id,
          review_status=case when review_status='candidate' then 'matched' else review_status end,
          review_reason='Linked to AFAT source-backed place candidate; not automatic operational truth.',
          updated_at=now()
      where id=v_rec.id;
    end if;
  end loop;
  return jsonb_build_object('city_key',p_city_key,'inserted_places',v_inserted,'linked_existing',v_linked,'automatic_truth',false);
end $$;

revoke all on function public.afat_promote_source_places(text,integer) from public,anon;
grant execute on function public.afat_promote_source_places(text,integer) to authenticated;

with candidates as (
  select distinct on (lower(r.canonical_name),round(r.latitude::numeric,4),round(r.longitude::numeric,4))
    r.*,
    case
      when r.source_category~*'(school|college|university|education)' then 'school'
      when r.source_category~*'(hospital|clinic|pharmacy|medical|health)' then 'hospital'
      when r.source_category~*'(market|supermarket|store|shop|mall)' then 'market'
      when r.source_category~*'(restaurant|cafe|bar|hotel|accommodation|venue|stadium|church|mosque)' then 'venue'
      when r.source_category~*'(office|government|bank|service|company|business|salon|repair|gas_station)' then 'business'
      when r.source_category~*'(stop|station|transport)' then 'stop'
      else 'place'
    end as destination_kind_calc
  from public.afat_geo_source_records r
  join public.afat_geo_import_batches b on b.id=r.last_import_batch_id
  where r.source_feature_kind='point'
    and r.canonical_name is not null and btrim(r.canonical_name)<>''
    and r.latitude is not null and r.longitude is not null
    and r.source_license is not null
    and b.status='completed'
    and lower(b.scope_label) like 'yaounde%'
  order by lower(r.canonical_name),round(r.latitude::numeric,4),round(r.longitude::numeric,4),coalesce(r.source_confidence,0) desc
)
insert into public.afat_places(
  canonical_name,aliases,description,city,latitude,longitude,location,place_type,vehicle_access,
  base_confidence,successful_pickups,failed_pickups,status,primary_source_key,primary_source_record_id,
  evidence_status,place_ref,destination_kind,reachability_state,metadata
)
select c.canonical_name,coalesce(c.alternate_names,'{}'::text[]),nullif(c.source_address,''),'Yaoundé',
  c.latitude,c.longitude,coalesce(c.location,ST_SetSRID(ST_MakePoint(c.longitude,c.latitude),4326)::geography),
  coalesce(nullif(c.source_category,''),'place'),'unknown',
  greatest(20,least(70,round(coalesce(c.source_confidence,0.4)*70)::int)),
  0,0,'unverified',c.source_key,c.id,'limited',
  'AFAT-'||upper(substr(md5(c.source_key||':'||c.external_feature_id),1,12)),c.destination_kind_calc,'learning',
  jsonb_build_object('source_category',c.source_category,'source_license',c.source_license,'attribution',c.attribution_text,
    'source_record_id',c.id,'source_only',true,'automatic_truth',false)
from candidates c
where not exists (
  select 1 from public.afat_places p
  where lower(p.city)=lower('Yaoundé')
    and lower(p.canonical_name)=lower(c.canonical_name)
    and ST_DWithin(
      coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
      coalesce(c.location,ST_SetSRID(ST_MakePoint(c.longitude,c.latitude),4326)::geography),80)
    and p.status<>'retired'
)
on conflict(place_ref) do nothing;

update public.afat_geo_source_records r
set linked_place_id=p.id,
    review_status=case when r.review_status='candidate' then 'matched' else r.review_status end,
    review_reason='Linked to AFAT source-backed place candidate; not automatic operational truth.',
    updated_at=now()
from public.afat_places p
where r.source_feature_kind='point'
  and r.linked_place_id is null
  and r.canonical_name is not null
  and lower(p.city)=lower('Yaoundé')
  and lower(p.canonical_name)=lower(r.canonical_name)
  and ST_DWithin(
    coalesce(p.location,ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography),
    coalesce(r.location,ST_SetSRID(ST_MakePoint(r.longitude,r.latitude),4326)::geography),80)
  and p.status<>'retired';
