with ranked as (
  select id,
         row_number() over (
           partition by target_edge_id
           order by
             case status when 'claimed' then 0 when 'submitted' then 1 else 2 end,
             priority desc,
             created_at asc,
             id
         ) as rn
  from public.afat_micro_missions
  where target_edge_id is not null
    and status in ('open','claimed','submitted')
)
update public.afat_micro_missions m
set status='cancelled',
    updated_at=now(),
    evidence=coalesce(m.evidence,'{}'::jsonb)||jsonb_build_object(
      'cancelled_reason','duplicate_active_target_edge_mission',
      'automatic_truth',false
    )
from ranked r
where m.id=r.id and r.rn>1;

create unique index if not exists afat_micro_missions_one_active_edge_idx
on public.afat_micro_missions(target_edge_id)
where target_edge_id is not null and status in ('open','claimed','submitted');
