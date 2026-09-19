-- Source-controlled copy of production migration 20260919220348

with city_metrics as (
  select
    c.id,
    count(e.id)::numeric as edges,
    count(e.id) filter(where e.confidence<55)::numeric as low_edges,
    count(e.id) filter(where e.last_observed_at<now()-interval '30 days')::numeric as stale_edges,
    count(e.id) filter(where e.evidence_status='provisional')::numeric as provisional_edges
  from public.afat_city_profiles c
  left join public.afat_atlas_nodes n on n.city=c.city_name and n.status='active'
  left join public.afat_atlas_edges e on e.from_node_id=n.id and e.status='active'
  where c.status='active'
  group by c.id
),
calculated as (
  select
    m.id,
    case when m.edges=0 then 0 else greatest(0,least(100,
      100
      - (m.low_edges/m.edges*35)
      - (m.stale_edges/m.edges*20)
      - (m.provisional_edges/m.edges*45)
    )) end as confidence
  from city_metrics m
)
update public.afat_city_profiles c
set operational_confidence=x.confidence,
    learning_stage=case
      when x.confidence<30 then 'observe'
      when x.confidence<45 then 'discover'
      when x.confidence<62 then 'verify'
      when x.confidence<74 then 'operate'
      when x.confidence<88 then 'learn'
      else 'predict'
    end,
    updated_at=now()
from calculated x
where c.id=x.id;

