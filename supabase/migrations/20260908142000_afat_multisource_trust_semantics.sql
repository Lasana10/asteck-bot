alter table public.afat_atlas_nodes drop constraint if exists afat_atlas_nodes_evidence_status_check;
alter table public.afat_atlas_nodes add constraint afat_atlas_nodes_evidence_status_check check (evidence_status in ('provisional','corroborated','verified','disputed'));
alter table public.afat_atlas_edges drop constraint if exists afat_atlas_edges_evidence_status_check;
alter table public.afat_atlas_edges add constraint afat_atlas_edges_evidence_status_check check (evidence_status in ('provisional','corroborated','verified','disputed'));

update public.afat_atlas_nodes
set evidence_status='provisional', updated_at=now()
where evidence_status='corroborated' and coalesce(safety_attributes->>'base_graph','')='provisional_osm';

update public.afat_atlas_edges
set evidence_status='provisional', updated_at=now()
where evidence_status='corroborated' and coalesce(restrictions->>'trust_basis','')='provisional_osm_base';

comment on column public.afat_atlas_edges.evidence_status is 'provisional=single-source/base geometry; corroborated=independent sources/evidence agree; verified=authoritative/field-verified; disputed=meaningful contradiction.';
comment on column public.afat_atlas_nodes.evidence_status is 'provisional=single-source/base geometry; corroborated=independent sources/evidence agree; verified=authoritative/field-verified; disputed=meaningful contradiction.';