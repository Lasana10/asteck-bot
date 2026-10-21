-- Private operator legal/vehicle compliance uploads. Reuse Supabase Storage,
-- existing compliance_records, staff review and audit. No public bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('afat-operator-compliance','afat-operator-compliance',false,8388608,
 array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=8388608,
 allowed_mime_types=excluded.allowed_mime_types;

-- Signed upload tokens are minted by authenticated backend after ownership check.
-- No direct blanket authenticated insert/select/update/delete on this sensitive bucket.
drop policy if exists "afat_operator_compliance_no_direct_access" on storage.objects;
-- Supabase Storage signed upload/read URLs carry their own short-lived authorisation.
-- Existing field-evidence bucket, policy and objects remain unchanged.
