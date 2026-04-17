create policy "analytics_events_insert_anon" on public.analytics_events
for insert
to anon
with check (profile_id is null);

create policy "client_errors_insert_anon" on public.client_errors
for insert
to anon
with check (profile_id is null);

grant execute on function public.track_client_event(text, jsonb) to anon;
grant execute on function public.record_client_error(text, text, jsonb, boolean) to anon;
