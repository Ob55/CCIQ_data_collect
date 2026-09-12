-- Auto-assign every active user when a form is created.
-- Admins & supervisors get can_fill + can_review; enumerators get can_fill only.
-- Done in a SECURITY DEFINER trigger so it runs server-side, cannot be bypassed by the
-- client, and applies to both form-creation paths (XLSForm upload and the builder).
-- Manual edits via setAssignments() still override these rows afterwards.

create or replace function public.auto_assign_new_form()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.assignments (form_id, user_id, can_fill, can_review)
  select new.id, p.id, true, (p.role in ('admin', 'supervisor'))
  from public.profiles p
  where p.active
  on conflict (form_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_form_created
  after insert on public.forms
  for each row execute function public.auto_assign_new_form();
