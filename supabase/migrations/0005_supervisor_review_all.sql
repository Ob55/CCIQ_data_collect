-- Supervisors review like admins (PRD §8): a supervisor's review queue should mirror the admin's,
-- seeing every submission — not only forms they were explicitly granted can_review on. The
-- fine-grained per-form can_review grant is kept for the (rare) case of granting review to an
-- enumerator, but supervisors and admins now have blanket review visibility.

-- Reviewer = active admin OR active supervisor. SECURITY DEFINER to bypass RLS / avoid recursion.
create or replace function public.can_review_any()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('admin', 'supervisor')
  );
$$;

-- submissions: own rows always; admins + supervisors see all; plus any explicit can_review grant.
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select using (
    public.can_review_any()
    or submitted_by = auth.uid()
    or public.can_review_form(public.form_id_for_version(form_version_id))
  );

-- reviews: admins + supervisors (or an explicit can_review grant), never the submitter.
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
  for insert with check (
    reviewer_id = auth.uid()
    and public.submission_owner(submission_id) <> auth.uid()
    and (
      public.can_review_any()
      or public.can_review_form(public.submission_form_id(submission_id))
    )
  );

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select using (
    public.can_review_any()
    or reviewer_id = auth.uid()
    or public.submission_owner(submission_id) = auth.uid()
    or public.can_review_form(public.submission_form_id(submission_id))
  );

-- attachments: reviewers (admins + supervisors) can see photos on any submission they can review.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select using (
    public.can_review_any()
    or public.submission_owner(submission_id) = auth.uid()
    or public.can_review_form(public.submission_form_id(submission_id))
  );
