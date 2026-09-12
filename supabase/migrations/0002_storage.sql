-- Private storage buckets (PRD §4.2, §5). All access is server-mediated via the service
-- role and short-lived signed URLs, so storage.objects keeps its default deny-all RLS —
-- we only need the buckets to exist.
insert into storage.buckets (id, name, public)
values
  ('xlsform-sources', 'xlsform-sources', false), -- original uploaded XLSForm workbooks
  ('attachments', 'attachments', false)          -- submission photos (used from Phase 4)
on conflict (id) do nothing;
