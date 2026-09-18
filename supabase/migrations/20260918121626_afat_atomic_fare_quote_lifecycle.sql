create or replace function public.afat_propose_fare_quote(
  p_assignment_id uuid,
  p_actor_profile_id uuid,
  p_actor_workspace text,
  p_amount_xaf integer,
  p_fare_source text,
  p_rationale text default null
)
returns public.afat_fare_quotes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_booking public.bookings%rowtype;
  v_source text;
  v_quote public.afat_fare_quotes%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501', message='Service role required'; end if;
  if p_actor_workspace not in ('operator','planner','admin') then raise exception using errcode='42501', message='Unsupported fare authority'; end if;
  if p_amount_xaf is null or p_amount_xaf not between 50 and 10000000 then raise exception using errcode='22023', message='Invalid XAF fare'; end if;
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found or v_assignment.booking_id is null then raise exception using errcode='P0002', message='Dispatch booking not found'; end if;
  if v_assignment.status not in ('accepted','assigned','en_route','arrived') then raise exception using errcode='40001', message='Fare quote is not allowed in this dispatch state'; end if;
  if p_actor_workspace='operator' and v_assignment.operator_id is distinct from p_actor_profile_id then raise exception using errcode='42501', message='Only the assigned Operator can propose this fare'; end if;
  select * into v_booking from public.bookings where id=v_assignment.booking_id for update;
  if not found then raise exception using errcode='P0002', message='Booking not found'; end if;
  if v_booking.payment_status in ('paid','paid_momo') then raise exception using errcode='40001', message='Booking is already provider-paid'; end if;
  v_source := case when p_actor_workspace='operator' then 'operator_quote'
    when p_fare_source in ('regulated_tariff','zone_rule','institution_contract','manual_dispatch') then p_fare_source
    else 'manual_dispatch' end;
  update public.afat_fare_quotes set status='superseded',updated_at=now() where dispatch_assignment_id=p_assignment_id and status='proposed';
  insert into public.afat_fare_quotes(dispatch_assignment_id,booking_id,operator_id,passenger_id,amount_xaf,fare_source,rationale,status,proposed_by,expires_at)
  values(p_assignment_id,v_booking.id,v_assignment.operator_id,v_booking.passenger_id,p_amount_xaf,v_source,nullif(trim(coalesce(p_rationale,'')),''),'proposed',p_actor_profile_id,now()+interval '20 minutes')
  returning * into v_quote;
  return v_quote;
end; $$;

create or replace function public.afat_decide_fare_quote(
  p_assignment_id uuid,
  p_passenger_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assignment public.dispatch_assignments%rowtype;
  v_booking public.bookings%rowtype;
  v_quote public.afat_fare_quotes%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception using errcode='42501', message='Service role required'; end if;
  if p_decision not in ('accepted','rejected') then raise exception using errcode='22023', message='Invalid fare decision'; end if;
  select * into v_assignment from public.dispatch_assignments where id=p_assignment_id for update;
  if not found or v_assignment.booking_id is null then raise exception using errcode='P0002', message='Dispatch booking not found'; end if;
  select * into v_booking from public.bookings where id=v_assignment.booking_id for update;
  if not found then raise exception using errcode='P0002', message='Booking not found'; end if;
  if v_booking.passenger_id is distinct from p_passenger_id then raise exception using errcode='42501', message='Only the Passenger can decide this fare'; end if;
  select * into v_quote from public.afat_fare_quotes where dispatch_assignment_id=p_assignment_id and status='proposed' order by created_at desc limit 1 for update;
  if not found then raise exception using errcode='P0002', message='No active fare quote'; end if;
  if v_quote.expires_at <= now() then
    update public.afat_fare_quotes set status='expired',updated_at=now() where id=v_quote.id;
    raise exception using errcode='40001', message='Fare quote expired';
  end if;
  if p_decision='accepted' and v_booking.payment_status in ('paid','paid_momo','collection_pending') then raise exception using errcode='40001', message='Payment state changed before fare acceptance'; end if;
  update public.afat_fare_quotes set status=p_decision,
    accepted_by=case when p_decision='accepted' then p_passenger_id else null end,
    accepted_at=case when p_decision='accepted' then now() else null end,
    rejected_at=case when p_decision='rejected' then now() else null end,
    updated_at=now()
  where id=v_quote.id returning * into v_quote;
  if p_decision='accepted' then
    update public.bookings set price_xaf=v_quote.amount_xaf,price_paid=v_quote.amount_xaf,payment_status='unpaid',updated_at=now()
    where id=v_booking.id returning * into v_booking;
  end if;
  return jsonb_build_object('quote',to_jsonb(v_quote),'booking',to_jsonb(v_booking));
end; $$;

revoke all on function public.afat_propose_fare_quote(uuid,uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.afat_decide_fare_quote(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.afat_propose_fare_quote(uuid,uuid,text,integer,text,text) to service_role;
grant execute on function public.afat_decide_fare_quote(uuid,uuid,text) to service_role;
create index if not exists afat_fare_quotes_operator_idx on public.afat_fare_quotes(operator_id) where operator_id is not null;
create index if not exists afat_fare_quotes_proposed_by_idx on public.afat_fare_quotes(proposed_by);
create index if not exists afat_fare_quotes_accepted_by_idx on public.afat_fare_quotes(accepted_by) where accepted_by is not null;
create index if not exists afat_field_reports_reviewed_by_idx on public.afat_field_reports(reviewed_by) where reviewed_by is not null;
