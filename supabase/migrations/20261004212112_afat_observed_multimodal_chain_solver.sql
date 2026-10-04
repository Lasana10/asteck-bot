-- Production synchronization for the observed multimodal solver.
-- The reachability kernel and ordered transit evidence tables are created by earlier migrations.
-- This migration preserves the production contract: reviewed ordered transit evidence may form
-- a walk -> transit -> walk chain; sparse evidence must remain explicit rather than fabricated.

comment on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz)
is 'AFAT observed multimodal planner: direct modes plus reviewed ordered walk-transit-walk evidence; automatic_truth=false.';

revoke all on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) from public,anon;
grant execute on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) to authenticated;
