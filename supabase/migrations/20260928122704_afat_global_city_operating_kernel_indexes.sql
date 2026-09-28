create index if not exists afat_city_operating_packs_country_idx
  on public.afat_city_operating_packs(country_code);

create index if not exists afat_city_adapter_bindings_adapter_idx
  on public.afat_city_adapter_bindings(adapter_key);
