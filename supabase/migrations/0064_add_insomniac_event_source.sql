alter table public.events drop constraint if exists events_source_primary_check;
alter table public.events add constraint events_source_primary_check
  check (source_primary in ('ticketmaster', 'seatgeek', 'manual', 'posh', 'dice', 'insomniac'));

alter table public.event_sources drop constraint if exists event_sources_provider_check;
alter table public.event_sources add constraint event_sources_provider_check
  check (provider in ('ticketmaster', 'seatgeek', 'posh', 'dice', 'manual', 'insomniac'));
