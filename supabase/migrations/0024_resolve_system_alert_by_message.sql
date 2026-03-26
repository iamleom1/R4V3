create or replace function public.resolve_system_alert_by_message(
  p_category text,
  p_message text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_resolved boolean;
  v_updated_count bigint := 0;
begin
  select exists(
    select 1
    from public.system_alerts
    where category = trim(coalesce(p_category, ''))
      and message = trim(coalesce(p_message, ''))
      and status = 'resolved'
  )
  into v_has_resolved;

  if v_has_resolved then
    delete from public.system_alerts
    where category = trim(coalesce(p_category, ''))
      and message = trim(coalesce(p_message, ''))
      and status = 'open';

    get diagnostics v_updated_count = row_count;
    return v_updated_count;
  end if;

  update public.system_alerts
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = null
  where category = trim(coalesce(p_category, ''))
    and message = trim(coalesce(p_message, ''))
    and status = 'open';

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

grant execute on function public.resolve_system_alert_by_message(text, text) to authenticated;
