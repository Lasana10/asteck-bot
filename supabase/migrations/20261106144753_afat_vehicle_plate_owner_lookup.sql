create or replace function public.afat_find_vehicle_by_plate(p_plate text)
returns table(id uuid,operator_id uuid,plate_number text,clearance_status text,is_available boolean)
language sql stable security definer set search_path=''
as $$
select v.id,v.operator_id,v.plate_number,v.clearance_status,v.is_available
from public.vehicles v
where upper(regexp_replace(v.plate_number,'[[:space:]-]+','','g')) =
      upper(regexp_replace(coalesce(p_plate,''),'[[:space:]-]+','','g'))
limit 1
$$;
revoke all on function public.afat_find_vehicle_by_plate(text) from public,anon,authenticated;
grant execute on function public.afat_find_vehicle_by_plate(text) to service_role;