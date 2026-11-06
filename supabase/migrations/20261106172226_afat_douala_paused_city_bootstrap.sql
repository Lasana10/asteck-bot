-- AFAT geographic expansion: reserve Douala as a distinct paused city.
-- This is NOT a claim of mapped coverage, operating vehicles, approved routes,
-- reviewed legal requirements or field-verified transport services.
-- Applied in AFAT production as migration 20261106172226.
insert into public.afat_city_profiles (
 city_key,city_name,country_code,country_name,timezone,currency_code,
 default_language,supported_languages,transport_modes,local_terms,data_sources,
 learning_stage,operational_confidence,metadata,status
)
values (
 'cm-douala','Douala','CM','Cameroon','Africa/Douala','XAF',
 'fr',array['fr','en']::text[],
 '["walk","moto","taxi","car","minibus","bus","bike","delivery"]'::jsonb,
 '{"meeting_point":{"en":"Meeting point","fr":"Point de rencontre"},"moto":{"en":"Moto","fr":"Moto"}}'::jsonb,
 '[]'::jsonb,'seed',0,
 '{"city_genesis_version":"v1","bootstrap":"planned_city_not_operational","automatic_truth":false,"coverage_review_state":"required","transport_supply_verified":false,"source_import_verified":false,"jurisdiction_rules_verified":false}'::jsonb,
 'paused'
)
on conflict (city_key) do nothing;
