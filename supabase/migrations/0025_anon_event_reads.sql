create policy "events_select_anon" on public.events
for select
to anon
using (true);

create policy "event_sources_select_anon" on public.event_sources
for select
to anon
using (true);
