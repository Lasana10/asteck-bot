-- A participant's active journey is selected across all of their bookings,
-- before the page limit. Only the authenticated backend may call this function.
create or replace function public.afat_passenger_dispatch_feed(
  p_passenger_id uuid, p_include_terminal boolean default false, p_limit integer default 50
) returns setof public.dispatch_assignments
language sql stable security invoker set search_path = ''
as $$
  select d.* from public.dispatch_assignments d
  join public.bookings b on b.id = d.booking_id
  where b.passenger_id = p_passenger_id
    and (p_include_terminal or d.status in
      ('queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed'))
  order by
    case when d.status in
      ('queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed')
      then 0 else 1 end,
    d.updated_at desc, d.id
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.afat_passenger_dispatch_feed(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.afat_passenger_dispatch_feed(uuid,boolean,integer) to service_role;
