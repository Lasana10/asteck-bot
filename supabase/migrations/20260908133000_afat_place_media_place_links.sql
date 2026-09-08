alter table public.afat_place_media
  add column if not exists place_id uuid references public.afat_places(id) on delete cascade;

alter table public.afat_place_media drop constraint if exists afat_place_media_check;
alter table public.afat_place_media add constraint afat_place_media_subject_check
  check (atlas_node_id is not null or geo_source_record_id is not null or place_id is not null);

create index if not exists afat_place_media_place_status_idx
  on public.afat_place_media(place_id, status, is_primary desc, confidence desc);

create or replace function public.afat_place_media_for_place(p_place_id uuid)
returns table (
  id uuid,
  media_kind text,
  storage_path text,
  external_url text,
  thumbnail_url text,
  caption text,
  alt_text text,
  rights_basis text,
  source_key text,
  source_license text,
  attribution_text text,
  captured_at timestamptz,
  is_primary boolean,
  confidence numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.media_kind, m.storage_path, m.external_url, m.thumbnail_url,
         m.caption, m.alt_text, m.rights_basis, m.source_key, m.source_license,
         m.attribution_text, m.captured_at, m.is_primary, m.confidence
  from public.afat_place_media m
  where m.place_id = p_place_id
    and m.status = 'approved'
    and m.rights_basis in ('first_party','user_contribution','open_license','licensed_partner')
  order by m.is_primary desc, m.confidence desc, coalesce(m.captured_at, m.observed_at) desc
  limit 24;
$$;

revoke all on function public.afat_place_media_for_place(uuid) from public;
grant execute on function public.afat_place_media_for_place(uuid) to anon, authenticated, service_role;

comment on function public.afat_place_media_for_place(uuid) is 'Returns only approved, rights-cleared imagery attached directly to an AFAT place used by passenger place resolution.';
