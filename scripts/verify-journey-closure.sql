-- Transaction-only regression fixture. No journey, payment, GPS or learning evidence persists.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare
 ids uuid[]; booking uuid; assignment uuid; first_receipt jsonb; result jsonb; version integer;
begin
 select array_agg(id) into ids from (select id from public.profiles order by id limit 3) p;
 if array_length(ids,1) < 3 then raise exception 'Three existing identities required for transaction-only verification'; end if;
 insert into public.bookings(passenger_id,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng)
 values(ids[1],3.86,11.50,3.87,11.51) returning id into booking;
 select id into assignment from public.dispatch_assignments where booking_id=booking limit 1;
 if assignment is null then insert into public.dispatch_assignments(booking_id) values(booking) returning id into assignment; end if;
 update public.dispatch_assignments set status='pickup_verified',operator_id=ids[2] where id=assignment;
 result := public.afat_transition_dispatch_journey(assignment,ids[2],'pickup_verified','in_journey','verify-start-0001',null,'{}');
 if (select status from public.bookings where id=booking) <> 'in_progress' then raise exception 'Booking status not synchronized'; end if;
 if (select status from public.afat_journeys where dispatch_assignment_id=assignment) <> 'active' then raise exception 'Journey not active'; end if;
 result := public.afat_transition_dispatch_journey(assignment,ids[2],'in_journey','completed','verify-complete-0001',null,'{}');
 result := public.afat_transition_dispatch_journey(assignment,ids[2],'pickup_verified','in_journey','verify-start-0001',null,'{}');
 if (select status from public.afat_journeys where dispatch_assignment_id=assignment) <> 'completed' then raise exception 'Replay resurrected completed journey'; end if;
 first_receipt := public.afat_update_journey_closure(assignment,ids[1],0,'verify-closure-0001','{"payment_state":"cash_due"}');
 result := public.afat_update_journey_closure(assignment,ids[1],0,'verify-closure-0001','{"payment_state":"cash_due"}');
 if result <> first_receipt then raise exception 'Duplicate closure request changed result'; end if;
 begin
  perform public.afat_update_journey_closure(assignment,ids[1],1,'verify-paid-0001','{"payment_state":"paid"}');
  raise exception 'Forged paid status accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.afat_update_journey_closure(assignment,ids[1],1,'verify-cash-0001','{"confirm_cash":true}');
  raise exception 'Passenger confirmed cash';
 exception when insufficient_privilege then null; end;
 begin
  perform public.afat_update_journey_closure(assignment,ids[2],1,'verify-rating-0001','{"rating":5}');
  raise exception 'Operator rated own journey';
 exception when insufficient_privilege then null; end;
 begin
  perform public.afat_update_journey_closure(assignment,ids[1],0,'verify-stale-0001','{"rating":4}');
  raise exception 'Stale receipt update accepted';
 exception when serialization_failure then null; end;
 result := public.afat_update_journey_closure(assignment,ids[2],1,'verify-cash-0002','{"confirm_cash":true}');
 if result->>'payment_verification' <> 'cash_confirmed' then raise exception 'Cash confirmation missing'; end if;
 result := public.afat_update_journey_closure(assignment,ids[1],2,'verify-rating-0002','{"rating":4,"dispute_reason":"Test dispute in rolled-back transaction"}');
 if result->>'receipt_number' <> first_receipt->>'receipt_number' then raise exception 'Receipt identity changed'; end if;
 if result->>'payment_verification' <> 'cash_confirmed' or result->>'payment_state' <> 'paid' then raise exception 'Feedback overwrote payment'; end if;
 begin
  perform public.afat_update_journey_closure(assignment,ids[1],3,'verify-overwrite-0001','{"payment_state":"pending"}');
  raise exception 'Confirmed payment overwritten';
 exception when serialization_failure then null; end;
 if (select count(*) from public.afat_journey_closure_events where dispatch_assignment_id=assignment) <> 3 then raise exception 'Wrong audit event count'; end if;
 if has_function_privilege('authenticated','public.afat_update_journey_closure(uuid,uuid,integer,text,jsonb)','EXECUTE') then raise exception 'RPC exposed to browser'; end if;
 if has_table_privilege('authenticated','public.afat_journey_closures','UPDATE') then raise exception 'Closure writable by browser'; end if;
end $$;
select 'PASS: atomic journey, booking status, replay, payment authority, rating ownership, stale writes, stable receipts, audit and grants' as verification;
rollback;
