create or replace function public.afat_atlas_set_node_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.location := public.st_setsrid(public.st_makepoint(new.longitude, new.latitude), 4326)::public.geography;
  new.updated_at := now();
  return new;
end;
$$;
