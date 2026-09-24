create index if not exists afat_source_dependencies_source_idx on public.afat_source_dependencies(source_key);
create index if not exists afat_source_dependencies_depends_idx on public.afat_source_dependencies(depends_on_source_key);
create index if not exists afat_environment_signals_source_idx on public.afat_environment_signals(source_key,observed_at desc);
create index if not exists afat_environment_signals_location_gix on public.afat_environment_signals using gist(location);
create index if not exists afat_operational_map_signals_journey_idx on public.afat_operational_map_signals(journey_id) where journey_id is not null;
create index if not exists afat_operational_map_signals_place_idx on public.afat_operational_map_signals(place_id) where place_id is not null;
create index if not exists afat_operational_map_signals_edge_idx on public.afat_operational_map_signals(edge_id) where edge_id is not null;
create index if not exists afat_edge_operational_overlays_edge_expiry_idx on public.afat_edge_operational_overlays(edge_id,expires_at);
