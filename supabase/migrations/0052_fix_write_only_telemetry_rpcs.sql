-- INSERT ... RETURNING requires a SELECT policy under RLS. Telemetry is deliberately
-- write-only for clients, so generate IDs before insertion instead of returning rows.

create or replace function public.track_client_event(
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid := gen_random_uuid();
  v_event_name text := trim(coalesce(p_event_name, ''));
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if v_event_name = '' then
    raise exception 'event_name_required';
  end if;
  if char_length(v_event_name) > 100 then
    raise exception 'event_name_too_long';
  end if;
  if pg_column_size(v_properties) > 16384 then
    raise exception 'event_properties_too_large';
  end if;

  insert into public.analytics_events (id, profile_id, event_name, properties)
  values (v_event_id, auth.uid(), v_event_name, v_properties);

  return v_event_id;
end;
$$;

create or replace function public.record_client_error(
  p_message text,
  p_stack text default null,
  p_context jsonb default '{}'::jsonb,
  p_is_fatal boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_error_id uuid := gen_random_uuid();
  v_message text := trim(coalesce(p_message, ''));
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
begin
  if v_message = '' then
    raise exception 'message_required';
  end if;
  if pg_column_size(v_context) > 16384 then
    raise exception 'error_context_too_large';
  end if;

  insert into public.client_errors (id, profile_id, message, stack, context, is_fatal)
  values (
    v_error_id,
    auth.uid(),
    left(v_message, 500),
    case when p_stack is null then null else left(p_stack, 8000) end,
    v_context,
    coalesce(p_is_fatal, false)
  );

  return v_error_id;
end;
$$;

revoke all on function public.track_client_event(text, jsonb) from public;
grant execute on function public.track_client_event(text, jsonb) to anon, authenticated;

revoke all on function public.record_client_error(text, text, jsonb, boolean) from public;
grant execute on function public.record_client_error(text, text, jsonb, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
