-- Restore client telemetry collection and keep operational writes service-only.

drop policy if exists "analytics_events_insert_anon" on public.analytics_events;
create policy "analytics_events_insert_anon" on public.analytics_events
for insert
to anon
with check (profile_id is null);

drop policy if exists "analytics_events_insert_authenticated" on public.analytics_events;
create policy "analytics_events_insert_authenticated" on public.analytics_events
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "client_errors_insert_anon" on public.client_errors;
create policy "client_errors_insert_anon" on public.client_errors
for insert
to anon
with check (profile_id is null);

drop policy if exists "client_errors_insert_authenticated" on public.client_errors;
create policy "client_errors_insert_authenticated" on public.client_errors
for insert
to authenticated
with check (profile_id = auth.uid());

revoke all on function public.track_client_event(text, jsonb) from public;
grant execute on function public.track_client_event(text, jsonb) to anon, authenticated;

revoke all on function public.record_client_error(text, text, jsonb, boolean) from public;
grant execute on function public.record_client_error(text, text, jsonb, boolean) to anon, authenticated;

-- These functions write trusted operational state and must not be callable by clients.
revoke all on function public.record_job_run(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_job_run(text, text, jsonb) to service_role;

revoke all on function public.create_system_alert(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_system_alert(text, text, text, jsonb) to service_role;

revoke all on function public.resolve_system_alert_by_message(text, text) from public, anon, authenticated;
grant execute on function public.resolve_system_alert_by_message(text, text) to service_role;

-- Admin analytics are exposed through moderator-checked RPCs, not direct views.
revoke all on public.admin_analytics_event_daily from public, anon, authenticated;
revoke all on public.admin_client_error_daily from public, anon, authenticated;

notify pgrst, 'reload schema';
