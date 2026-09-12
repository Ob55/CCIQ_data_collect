-- Admins may fill (submit) any deployed form, without a can_fill assignment.
-- The original submissions_insert policy (0001_init.sql) gated inserts on can_fill_form(),
-- which only checks the assignments table — so admins, who have no assignment rows, were
-- blocked from submitting. Add an is_admin() bypass. The identity + role-consistency checks
-- (submitted_by = auth.uid(), submitted_by_role = current_user_role()) still apply to everyone.

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert with check (
    submitted_by = auth.uid()
    and submitted_by_role = public.current_user_role()
    and (
      public.is_admin()
      or public.can_fill_form(public.form_id_for_version(form_version_id))
    )
  );
