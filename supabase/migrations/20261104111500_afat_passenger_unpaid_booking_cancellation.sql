-- Passenger self-cancellation is limited to an unpaid unstarted booking.
-- A queued/automatic operator assignment must be closed atomically. Any
-- accepted/pickup/financially uncertain dispatch requires supervised review.
create or replace function public.afat_cancel_unpaid_passenger_booking(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $afat$
declare
 v_uid uuid := (select auth.uid());
 v_booking public.bookings%rowtype;
 v_dispatch public.dispatch_assignments%rowtype;
 v_route public.routes%rowtype;
 v_count integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_booking_id is null then raise exception 'Booking ID required' using errcode='22023'; end if;
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking unavailable' using errcode='P0002'; end if;
 if v_booking.passenger_id<>v_uid then raise exception 'Booking ownership required' using errcode='42501'; end if;
 if v_booking.status='cancelled' then
   return jsonb_build_object('booking_id',p_booking_id,'status','cancelled','changed',false,
     'payment_refunded',false,'payment_taken',false);
 end if;
 if v_booking.status<>'pending' or v_booking.boarded_at is not null or
    v_booking.started_at is not null or v_booking.completed_at is not null then
   raise exception 'Booking has progressed: contact AFAT operations' using errcode='P0001';
 end if;
 if v_booking.payment_status not in ('unpaid','failed') or
    v_booking.transaction_id is not null then
   raise exception 'Payment or settlement needs staff reconciliation; self-cancellation prohibited' using errcode='P0001';
 end if;
 select * into v_route from public.routes where id=v_booking.route_id;
 if not found or v_route.departure_time<=now() then
   raise exception 'Departure has started or is unavailable; staff review required' using errcode='P0001';
 end if;
 -- A passenger may not interrupt an actual operator pickup or live journey.
 if exists(select 1 from public.afat_journeys j where j.booking_id=p_booking_id) then
   raise exception 'Journey evidence already exists; staff resolution required' using errcode='P0001';
 end if;
 select * into v_dispatch from public.dispatch_assignments
    where booking_id=p_booking_id for update;
 if found and (v_dispatch.status not in ('queued','assigned') or
    v_dispatch.offered_at is not null or v_dispatch.accepted_at is not null or
    v_dispatch.pickup_verified_at is not null or v_dispatch.started_at is not null or
    v_dispatch.completed_at is not null) then
   raise exception 'Dispatch has progressed; staff resolution required' using errcode='P0001';
 end if;
 update public.bookings set status='cancelled',updated_at=now()
   where id=p_booking_id and status='pending';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Concurrent booking state change; retry only after status check' using errcode='40001'; end if;
 if v_dispatch.id is not null then
   update public.dispatch_assignments
      set status='cancelled',cancelled_at=now(),updated_at=now(),
          failure_reason='Passenger withdrew unpaid, unstarted booking'
    where id=v_dispatch.id and status in ('queued','assigned');
   insert into public.dispatch_assignment_events(
     assignment_id,actor_profile_id,event_type,from_status,to_status,
     reason,evidence,idempotency_key
   ) values(
     v_dispatch.id,v_uid,'dispatch.passenger_unpaid_cancelled',
     v_dispatch.status,'cancelled',
     'Passenger withdrew unpaid, unstarted booking',
     jsonb_build_object('booking_id',p_booking_id,'payment_collected',false),
     'booking:'||p_booking_id::text||':unpaid-cancelled'
   ) on conflict(assignment_id,idempotency_key) do nothing;
 end if;
 insert into public.trip_events(booking_id,actor_id,event_type,metadata)
 values(p_booking_id,v_uid,'cancelled',
   jsonb_build_object('initiator','passenger','financial_truth','unpaid',
     'no_refund_claimed',true,'dispatch_cancelled',v_dispatch.id is not null));
 return jsonb_build_object('booking_id',p_booking_id,'status','cancelled',
    'changed',true,'payment_taken',false,'payment_refunded',false,
    'dispatch_cancelled',v_dispatch.id is not null);
end;
$afat$;
revoke all on function public.afat_cancel_unpaid_passenger_booking(uuid) from public,anon,authenticated;
grant execute on function public.afat_cancel_unpaid_passenger_booking(uuid) to authenticated,service_role;
