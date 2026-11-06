-- Prevent the same physical vehicle registration being claimed by another operator,
-- including concurrent writes and differently spaced or hyphenated plate numbers.
create unique index if not exists vehicles_plate_global_normalized_uidx
on public.vehicles ((upper(regexp_replace(plate_number, '[[:space:]-]+', '', 'g'))))
where plate_number is not null and length(btrim(plate_number)) > 0;
