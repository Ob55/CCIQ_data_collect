-- Storage RLS for the SPA (no more service-role uploads/signing).
-- Buckets stay private; access is governed by these policies + short-lived signed URLs the
-- client creates. `owner` is set by Supabase to auth.uid() on upload.

-- attachments (submission photos): uploader keeps access; reviewers (admin/supervisor) can view.
create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments');

create policy attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = auth.uid()
      or public.is_admin()
      or public.current_user_role() = 'supervisor'
    )
  );

-- xlsform-sources (original workbooks): only admins/supervisors upload and read.
create policy xlsform_sources_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'xlsform-sources'
    and (public.is_admin() or public.current_user_role() = 'supervisor')
  );

create policy xlsform_sources_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'xlsform-sources'
    and (public.is_admin() or public.current_user_role() = 'supervisor')
  );
