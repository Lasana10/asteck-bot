create or replace function public.afat_guard_app_incident_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accuracy numeric;
begin
  if lower(coalesce(new.source, '')) = 'app' then
    if new.movement_log_id is null then
      raise exception 'AFAT app incidents require a movement log backed by a real location fix';
    end if;

    select ml.accuracy into v_accuracy
    from public.movement_logs ml
    where ml.id = new.movement_log_id;

    if v_accuracy is null or v_accuracy <= 0 or v_accuracy > 250 then
      raise exception 'AFAT app incidents require a device/map location fix with accuracy between 0 and 250 metres';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists afat_guard_app_incident_location_trigger on public.incidents;
create trigger afat_guard_app_incident_location_trigger
before insert or update of latitude, longitude, movement_log_id, source
on public.incidents
for each row
execute function public.afat_guard_app_incident_location();

comment on function public.afat_guard_app_incident_location() is 'Prevents app-submitted incidents from entering AFAT with invented or unlocated coordinates. App incidents must be tied to a movement log carrying a real bounded-accuracy location fix.';
