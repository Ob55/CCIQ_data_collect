-- Shared (cross-instance) rate limiter backed by Postgres (PRD §10). Replaces the
-- per-instance in-memory limiter so limits hold across all serverless functions.
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- No policies => only the service role (which bypasses RLS) can touch it.
alter table public.rate_limits enable row level security;

-- Atomically record a hit and report whether the caller is still within the limit.
-- Returns true if allowed, false if the limit for the current window is exceeded.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
        then 1
      else public.rate_limits.count + 1
    end,
    window_start = case
      when public.rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
        then v_now
      else public.rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
