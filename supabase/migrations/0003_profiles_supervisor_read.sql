-- Allow supervisors to read all profiles (needed for the assignment picker in §7).
-- This intentionally extends PRD §6.1 ("admins read all") per product decision: supervisors
-- assign enumerators, so they must be able to see the roster. Write access is unchanged —
-- only admins can modify profiles/roles.
create policy profiles_select_supervisor on public.profiles
  for select using (public.current_user_role() = 'supervisor');
