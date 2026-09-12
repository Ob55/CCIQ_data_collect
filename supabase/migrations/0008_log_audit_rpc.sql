-- Append-only audit writes from the browser (SPA migration).
-- The audit_log table has no INSERT policy, so only privileged code can write it. In the SPA
-- there is no service role, so we expose a single SECURITY DEFINER function that appends a row
-- with actor_id forced to auth.uid(). Users still cannot UPDATE/DELETE the log, so it stays
-- immutable; they can only append an entry attributed to themselves.

create or replace function public.log_audit(
  p_entity_type text,
  p_entity_id   text,
  p_action      text,
  p_meta        jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.audit_log (actor_id, entity_type, entity_id, action, meta)
  values (auth.uid(), p_entity_type, nullif(p_entity_id, ''), p_action, coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke all on function public.log_audit(text, text, text, jsonb) from public;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
