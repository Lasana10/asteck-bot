-- AFAT reachability FK indexes.
-- Production-aligned with migration 20260924162557.

create index if not exists afat_access_points_atlas_edge_idx on public.afat_access_points(atlas_edge_id) where atlas_edge_id is not null;
create index if not exists afat_access_points_atlas_node_idx on public.afat_access_points(atlas_node_id) where atlas_node_id is not null;
create index if not exists afat_access_points_source_observation_idx on public.afat_access_points(source_observation_id) where source_observation_id is not null;
create index if not exists afat_destination_claims_reviewed_by_idx on public.afat_destination_claims(reviewed_by) where reviewed_by is not null;
create index if not exists afat_intent_sessions_access_idx on public.afat_intent_sessions(access_point_id) where access_point_id is not null;
create index if not exists afat_intent_sessions_meeting_idx on public.afat_intent_sessions(meeting_point_id) where meeting_point_id is not null;
create index if not exists afat_reach_links_access_idx on public.afat_reach_links(access_point_id) where access_point_id is not null;
create index if not exists afat_reach_links_meeting_idx on public.afat_reach_links(meeting_point_id) where meeting_point_id is not null;
create index if not exists afat_unresolved_destination_resolved_place_idx on public.afat_unresolved_destination_demand(resolved_place_id) where resolved_place_id is not null;
create index if not exists afat_unresolved_destination_user_idx on public.afat_unresolved_destination_demand(user_id,last_seen_at desc) where user_id is not null;
create index if not exists afat_meeting_points_atlas_edge_idx on public.afat_meeting_points(atlas_edge_id) where atlas_edge_id is not null;
create index if not exists afat_meeting_points_atlas_node_idx on public.afat_meeting_points(atlas_node_id) where atlas_node_id is not null;
