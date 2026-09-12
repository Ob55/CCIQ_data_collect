-- CleanCook Data Collection — initial schema (PRD §6)
-- Every table has RLS enabled with policies in this same migration (PRD §13).
-- Self-review block and audit-log immutability are enforced here in SQL, not just in app code.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'supervisor', 'enumerator');
create type public.form_status as enum ('draft', 'deployed', 'retired');
create type public.submission_status as enum ('new', 'approved', 'flagged', 'rejected');
create type public.review_action as enum ('approve', 'flag', 'reject');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- profiles extends auth.users with role + status. Never store password hashes here.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'enumerator',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text not null unique,
  description text,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table public.form_versions (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.forms (id) on delete cascade,
  version_no       integer not null,
  schema           jsonb not null,
  source_file_path text,
  status           public.form_status not null default 'draft',
  deployed_at      timestamptz,
  deployed_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (form_id, version_no)
);

create table public.assignments (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.forms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  can_fill   boolean not null default true,
  can_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (form_id, user_id)
);

-- id is a client-generated UUID (PRD §6). The submit endpoint uses ON CONFLICT DO NOTHING
-- so a double-tapped submit or a retry never creates two records.
create table public.submissions (
  id                uuid primary key,
  form_version_id   uuid not null references public.form_versions (id),
  submitted_by      uuid not null references public.profiles (id),
  submitted_by_role public.user_role not null,
  data              jsonb not null default '{}'::jsonb,
  status            public.submission_status not null default 'new',
  started_at        timestamptz,
  submitted_at      timestamptz not null default now(),
  duration_seconds  integer,
  geo_lat           double precision,
  geo_lng           double precision,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_name text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reviewer_id   uuid not null references public.profiles (id),
  action        public.review_action not null,
  comment       text,
  created_at    timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  entity_type text not null,
  entity_id   text,
  action      text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (PRD §6)
-- ---------------------------------------------------------------------------
create index submissions_version_status_idx on public.submissions (form_version_id, status);
create index submissions_submitted_by_idx on public.submissions (submitted_by);
create index submissions_submitted_at_idx on public.submissions (submitted_at);
create index submissions_data_gin_idx on public.submissions using gin (data);
create index assignments_user_idx on public.assignments (user_id);
create index form_versions_form_idx on public.form_versions (form_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS and avoid policy recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.owns_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.forms f where f.id = p_form_id and f.created_by = auth.uid()
  );
$$;

create or replace function public.is_assigned_to_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a where a.form_id = p_form_id and a.user_id = auth.uid()
  );
$$;

create or replace function public.can_fill_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a
    where a.form_id = p_form_id and a.user_id = auth.uid() and a.can_fill
  );
$$;

create or replace function public.can_review_form(p_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a
    where a.form_id = p_form_id and a.user_id = auth.uid() and a.can_review
  );
$$;

create or replace function public.has_deployed_version(p_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.form_versions v where v.form_id = p_form_id and v.status = 'deployed'
  );
$$;

create or replace function public.form_id_for_version(p_version_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select form_id from public.form_versions where id = p_version_id;
$$;

create or replace function public.submission_form_id(p_submission_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select fv.form_id
  from public.submissions s
  join public.form_versions fv on fv.id = s.form_version_id
  where s.id = p_submission_id;
$$;

create or replace function public.submission_owner(p_submission_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select submitted_by from public.submissions where id = p_submission_id;
$$;

-- ---------------------------------------------------------------------------
-- Auth trigger: create a profile row for each new auth user.
-- Role + full_name come from user metadata set at invite time; default enumerator.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'enumerator')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Review trigger: a review changes the submission STATUS only, never its data (PRD §8).
-- Keeping this in a trigger means no user ever needs UPDATE on submissions.
-- ---------------------------------------------------------------------------
create or replace function public.apply_review_to_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.submissions
  set status = case new.action
    when 'approve' then 'approved'::public.submission_status
    when 'flag'    then 'flagged'::public.submission_status
    when 'reject'  then 'rejected'::public.submission_status
  end
  where id = new.submission_id;
  return new;
end;
$$;

create trigger on_review_created
  after insert on public.reviews
  for each row execute function public.apply_review_to_submission();

-- ---------------------------------------------------------------------------
-- Row Level Security (PRD §6.1). Enabled on EVERY table.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.forms         enable row level security;
alter table public.form_versions enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.attachments   enable row level security;
alter table public.reviews       enable row level security;
alter table public.audit_log     enable row level security;

-- profiles: read own row; admins read/write all. Inserts happen via the definer trigger.
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- forms
create policy forms_select on public.forms
  for select using (
    public.is_admin()
    or created_by = auth.uid()
    or (
      public.is_assigned_to_form(id)
      and (public.current_user_role() = 'supervisor' or public.has_deployed_version(id))
    )
  );
create policy forms_insert on public.forms
  for insert with check (
    (public.is_admin() or public.current_user_role() = 'supervisor')
    and created_by = auth.uid()
  );
create policy forms_update on public.forms
  for update using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

-- form_versions: insert/update Admin+Supervisor; enumerators read only deployed for assigned forms.
create policy form_versions_select on public.form_versions
  for select using (
    public.is_admin()
    or public.owns_form(form_id)
    or (
      public.is_assigned_to_form(form_id)
      and (public.current_user_role() = 'supervisor' or status = 'deployed')
    )
  );
create policy form_versions_insert on public.form_versions
  for insert with check (
    public.is_admin()
    or (
      public.current_user_role() = 'supervisor'
      and (public.owns_form(form_id) or public.is_assigned_to_form(form_id))
    )
  );
create policy form_versions_update on public.form_versions
  for update using (
    public.is_admin()
    or (public.current_user_role() = 'supervisor'
        and (public.owns_form(form_id) or public.is_assigned_to_form(form_id)))
  ) with check (
    public.is_admin()
    or (public.current_user_role() = 'supervisor'
        and (public.owns_form(form_id) or public.is_assigned_to_form(form_id)))
  );

-- assignments: manageable by admins, the form owner, or a supervisor who can review the form.
create policy assignments_select on public.assignments
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or public.owns_form(form_id)
    or public.can_review_form(form_id)
  );
create policy assignments_write on public.assignments
  for all using (
    public.is_admin() or public.owns_form(form_id) or public.can_review_form(form_id)
  ) with check (
    public.is_admin() or public.owns_form(form_id) or public.can_review_form(form_id)
  );

-- submissions: insert requires can_fill on the form and the row must be your own.
-- select: own rows always; admins all; supervisors only where they hold can_review.
create policy submissions_insert on public.submissions
  for insert with check (
    submitted_by = auth.uid()
    and submitted_by_role = public.current_user_role()
    and public.can_fill_form(public.form_id_for_version(form_version_id))
  );
create policy submissions_select on public.submissions
  for select using (
    public.is_admin()
    or submitted_by = auth.uid()
    or public.can_review_form(public.form_id_for_version(form_version_id))
  );

-- reviews: only Admin, or Supervisor with can_review, AND never the submitter (self-review block).
create policy reviews_insert on public.reviews
  for insert with check (
    reviewer_id = auth.uid()
    and public.submission_owner(submission_id) <> auth.uid()
    and (public.is_admin() or public.can_review_form(public.submission_form_id(submission_id)))
  );
create policy reviews_select on public.reviews
  for select using (
    public.is_admin()
    or reviewer_id = auth.uid()
    or public.submission_owner(submission_id) = auth.uid()
    or public.can_review_form(public.submission_form_id(submission_id))
  );

-- attachments: follow the parent submission's policy.
create policy attachments_insert on public.attachments
  for insert with check (
    public.is_admin() or public.submission_owner(submission_id) = auth.uid()
  );
create policy attachments_select on public.attachments
  for select using (
    public.is_admin()
    or public.submission_owner(submission_id) = auth.uid()
    or public.can_review_form(public.submission_form_id(submission_id))
  );

-- audit_log: no insert/update/delete policies => only the service role can write (bypasses RLS).
-- Readable by admins only. Never updatable or deletable.
create policy audit_log_select on public.audit_log
  for select using (public.is_admin());
