-- Keep write policies from doubling as SELECT policies and index operational lookups.

drop policy dreem_school_brands_manage on public.dreem_school_brands;
create policy dreem_school_brands_insert on public.dreem_school_brands for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_school_brands_update on public.dreem_school_brands for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_school_brands_delete on public.dreem_school_brands for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

drop policy dreem_guardians_manage on public.dreem_guardians;
create policy dreem_guardians_insert on public.dreem_guardians for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_guardians_update on public.dreem_guardians for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_guardians_delete on public.dreem_guardians for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

drop policy dreem_student_guardians_manage on public.dreem_student_guardians;
create policy dreem_student_guardians_insert on public.dreem_student_guardians for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_student_guardians_update on public.dreem_student_guardians for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_student_guardians_delete on public.dreem_student_guardians for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

do $$ declare t text; begin foreach t in array array['dreem_student_credentials','dreem_growth_snapshots','dreem_interventions'] loop
  execute format('drop policy dreem_student_record_write on public.%I',t);
  execute format('create policy dreem_student_record_insert on public.%I for insert to authenticated with check ((select private.dreem_has_role(school_id,array[''leadership'',''support'',''teacher''])))',t);
  execute format('create policy dreem_student_record_update on public.%I for update to authenticated using ((select private.dreem_has_role(school_id,array[''leadership'',''support'',''teacher'']))) with check ((select private.dreem_has_role(school_id,array[''leadership'',''support'',''teacher''])))',t);
  execute format('create policy dreem_student_record_delete on public.%I for delete to authenticated using ((select private.dreem_has_role(school_id,array[''leadership'',''support''])))',t);
end loop; end $$;

drop policy dreem_teacher_growth_write on public.dreem_teacher_growth_snapshots;
create policy dreem_teacher_growth_insert on public.dreem_teacher_growth_snapshots for insert to authenticated with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_teacher_growth_update on public.dreem_teacher_growth_snapshots for update to authenticated using ((select private.dreem_has_role(school_id,array['leadership','support']))) with check ((select private.dreem_has_role(school_id,array['leadership','support'])));
create policy dreem_teacher_growth_delete on public.dreem_teacher_growth_snapshots for delete to authenticated using ((select private.dreem_has_role(school_id,array['leadership'])));

create index dreem_guardians_school_idx on public.dreem_guardians(school_id);
create index dreem_guardians_user_idx on public.dreem_guardians(user_id);
create index dreem_student_guardians_school_idx on public.dreem_student_guardians(school_id);
create index dreem_student_guardians_guardian_idx on public.dreem_student_guardians(guardian_id);
create index dreem_credentials_school_student_idx on public.dreem_student_credentials(school_id,student_id);
create index dreem_growth_school_student_date_idx on public.dreem_growth_snapshots(school_id,student_id,snapshot_date desc);
create index dreem_interventions_school_student_status_idx on public.dreem_interventions(school_id,student_id,status);
create index dreem_interventions_owner_idx on public.dreem_interventions(owner_user_id);
create index dreem_teacher_growth_school_teacher_date_idx on public.dreem_teacher_growth_snapshots(school_id,teacher_user_id,snapshot_date desc);
create index dreem_signals_school_status_created_idx on public.dreem_community_signals(school_id,status,created_at desc);
create index dreem_signals_source_idx on public.dreem_community_signals(source_user_id);
create index dreem_signal_events_signal_created_idx on public.dreem_signal_events(signal_id,created_at);
create index dreem_cashier_school_user_idx on public.dreem_cashier_sessions(school_id,cashier_user_id);
create index dreem_payments_school_student_received_idx on public.dreem_financial_payments(school_id,student_id,received_at desc);
create index dreem_payments_cashier_idx on public.dreem_financial_payments(cashier_session_id);
create index dreem_payments_fee_account_idx on public.dreem_financial_payments(fee_account_id);
create index dreem_payments_reversal_idx on public.dreem_financial_payments(reverses_payment_id);
create index dreem_payment_events_payment_created_idx on public.dreem_payment_events(payment_id,created_at);
create index dreem_reconciliation_session_idx on public.dreem_reconciliation_reviews(cashier_session_id);

do $$
begin
  if to_regprocedure('public.current_dreem_membership_status()') is not null then
    execute 'revoke execute on function public.current_dreem_membership_status() from anon';
  end if;
end
$$;
