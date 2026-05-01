with off_target_ticketmaster_events as (
  select e.id
  from public.events e
  where e.source_primary = 'ticketmaster'
    and e.starts_at >= now()
    and not exists (
      select 1
      from public.event_rsvps r
      where r.event_id = e.id
    )
    and not exists (
      select 1
      from public.event_sources es
      where es.event_id = e.id
        and es.provider <> 'ticketmaster'
    )
    and not (
      lower(
        concat_ws(
          ' ',
          coalesce(e.title, ''),
          coalesce(e.venue_name, ''),
          array_to_string(coalesce(e.genre_tags, '{}'::text[]), ' ')
        )
      ) like any (
        array[
          '%afters%',
          '%afterhours%',
          '%house%',
          '%tech house%',
          '%progressive house%',
          '%afro house%',
          '%deep house%',
          '%minimal house%',
          '%techno%',
          '%melodic techno%',
          '%hard techno%',
          '%dubstep%',
          '%drum and bass%',
          '%dnb%',
          '%trance%',
          '%hardstyle%',
          '%bass%',
          '%future bass%',
          '%uk garage%',
          '%garage%',
          '%breakbeat%',
          '%all night long%',
          '%open to close%',
          '%b2b%',
          '%warehouse rave%',
          '%rave%'
        ]
      )
    )
)
delete from public.events e
using off_target_ticketmaster_events doomed
where e.id = doomed.id;
