-- Performance indexing + data archiving (pre-launch DB requirements).

-- ---------------------------------------------------------------------------
-- Indexes for the app's hot query paths (0001 already covers submissions by
-- version/status/submitter/date + a GIN on data, assignments by user, versions
-- by form). These fill the remaining gaps used by review, export, audit and RLS.
-- ---------------------------------------------------------------------------
create index if not exists reviews_submission_idx    on public.reviews (submission_id);
create index if not exists reviews_reviewer_idx       on public.reviews (reviewer_id);
create index if not exists attachments_submission_idx on public.attachments (submission_id);
create index if not exists audit_log_created_idx      on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx       on public.audit_log (entity_type, created_at desc);
create index if not exists forms_created_by_idx       on public.forms (created_by);
create index if not exists form_versions_form_status_idx on public.form_versions (form_id, status);

-- ---------------------------------------------------------------------------
-- Archiving: soft-archive submissions (forms already have archived_at). Old data
-- is retained but can be filtered out of active views by archived_at IS NULL.
-- Partial indexes keep the common "active only" scans fast without scanning
-- archived rows.
-- ---------------------------------------------------------------------------
alter table public.submissions add column if not exists archived_at timestamptz;

create index if not exists submissions_active_idx
  on public.submissions (form_version_id, submitted_at desc)
  where archived_at is null;

create index if not exists forms_active_idx
  on public.forms (created_at desc)
  where archived_at is null;

-- Admin-only archive/restore of a submission, written through a definer RPC so it
-- stays controlled (users cannot UPDATE submissions directly) and is audited.
create or replace function public.set_submission_archived(p_submission_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  update public.submissions
     set archived_at = case when p_archived then now() else null end
   where id = p_submission_id;
  insert into public.audit_log (actor_id, entity_type, entity_id, action, meta)
  values (auth.uid(), 'submission', p_submission_id::text,
          case when p_archived then 'submission.archive' else 'submission.restore' end, '{}'::jsonb);
end;
$$;

revoke all on function public.set_submission_archived(uuid, boolean) from public;
grant execute on function public.set_submission_archived(uuid, boolean) to authenticated;
