-- Field photographs are private contributor and evidence-review artifacts.
-- Viewing aggregate city planning statistics cannot authorize accessing photos.
drop policy if exists afat_field_evidence_read_own_or_review on storage.objects;
create policy afat_field_evidence_read_own_or_review
  on storage.objects for select to authenticated
  using (
    bucket_id='afat-field-evidence'
    and (
      (storage.foldername(name))[1]=auth.uid()::text
      or public.afat_has_permission('map.evidence.review')
      or public.afat_has_permission('system.configure')
    )
  );
