alter function public.afat_guard_app_incident_location()
  set search_path = '';

revoke all on function public.afat_guard_app_incident_location()
  from public, anon, authenticated;

grant execute on function public.afat_guard_app_incident_location()
  to service_role;
