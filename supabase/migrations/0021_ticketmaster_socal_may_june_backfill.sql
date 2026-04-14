do $$
declare
  rec record;
  v_event_id uuid;
begin
  for rec in
    select *
    from jsonb_to_recordset(
      '[
        {"provider_event_id":"vv1AaZk8MGkdIZQft","title":"ford. plus OLAN","venue_name":"Echoplex","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-01T02:00:00Z","genre_tags":["Electro Pop","Dance/Electronic"]},
        {"provider_event_id":"vv1AaZkowGkdfmDR8","title":"House Of Heavy - 18+","venue_name":"Constellation Room","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-05-02T03:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"vv1AaZko7Gkdk8b0J","title":"HVOB presents The Silver Cage - U.S. 2026","venue_name":"The Regent Theater","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-02T04:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfApkf","title":"Dual Damage w/ Special Guest Vertile","venue_name":"Exchange LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-02T05:00:00Z","genre_tags":["Hard Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfjAuS","title":"Nostalgix","venue_name":"Academy LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-02T05:00:00Z","genre_tags":["Dance/Electronic","Bass House"]},
        {"provider_event_id":"rZ7HnEZ1AfqaON","title":"YDG","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-02T05:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"vvG1iZ_dw9LVJ_","title":"Core Los Angeles","venue_name":"LA State Historic Park","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-02T19:00:00Z","genre_tags":["Dance/Electronic","Club Dance","Techno"]},
        {"provider_event_id":"vvG1IZbgmJ5BOy","title":"Bob Moses & Cannons: Afterglow Tour","venue_name":"The Rady Shell at Jacobs Park","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-03T01:30:00Z","genre_tags":["Dance/Electronic","Electro Pop"]},
        {"provider_event_id":"vv1AaZkuvGkd8LEpY","title":"Tokyo Machine","venue_name":"The Echo","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-03T02:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"Z7r9jZ1A7O_oN","title":"Le Youth","venue_name":"The Novo by Microsoft","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-03T04:00:00Z","genre_tags":["Club Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Afr_bK","title":"Henry Fong","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-05-03T05:00:00Z","genre_tags":["Club Dance","Dance/Electronic"]},
        {"provider_event_id":"vvG1iZ_dw9gfEE","title":"Core Los Angeles","venue_name":"LA State Historic Park","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-03T19:00:00Z","genre_tags":["Dance/Electronic","Techno","Club Dance"]},
        {"provider_event_id":"vv1AaZko3GkdONzbB","title":"Earlybirds Club","venue_name":"The Bellwether","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-09T01:00:00Z","genre_tags":["Club Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Af7dA7","title":"Forester - Somewhere in Between w/ ME N U and Andrea Calabria","venue_name":"Music Box","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-09T04:00:00Z","genre_tags":["Dance/Electronic","Melodic House"]},
        {"provider_event_id":"rZ7HnEZ1AKPzP0","title":"Peekaboo 360°","venue_name":"Exchange LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-09T05:00:00Z","genre_tags":["Dubstep","Bass"]},
        {"provider_event_id":"rZ7HnEZ1AfAYG7","title":"MORTEN","venue_name":"Academy LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-05-09T05:00:00Z","genre_tags":["Dance/Electronic","Club Dance"]},
        {"provider_event_id":"rZ7HnEZ1Afq4jS","title":"KLOUD w/ Special Guest Pleasurekraft","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-09T05:00:00Z","genre_tags":["Dance/Electronic","Techno"]},
        {"provider_event_id":"rZ7HnEZ1Afr4pd","title":"R3HAB","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-10T05:00:00Z","genre_tags":["House","Club Dance","Dance/Electronic"]},
        {"provider_event_id":"vvG1iZbMpHqbV1","title":"Sina Bathaie - White Lotus World Tour 2026","venue_name":"The Observatory North Park","city":"San Diego","region":"CA","country":"US","starts_at":"2026-05-15T02:30:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfO6Pd","title":"Lady Faith","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-05-23T05:00:00Z","genre_tags":["Hard Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfqK4N","title":"Walker & Royce","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-05-23T05:00:00Z","genre_tags":["Club Dance","House","Dance/Electronic"]},
        {"provider_event_id":"vv1AaZkuyGkdwKGc8","title":"Dance With The Dead + Magic Sword - The Face Off Tour 2026","venue_name":"The Observatory","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-05-24T02:00:00Z","genre_tags":["Dance/Electronic","Synthwave"]},
        {"provider_event_id":"vv170Z_eGkMKEjpv","title":"Insomniac Presents: KSHMR","venue_name":"Hollywood Palladium","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-05-24T03:00:00Z","genre_tags":["Dance/Electronic","Festival EDM"]},
        {"provider_event_id":"rZ7HnEZ1Afr3_S","title":"SABAI","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-05-31T05:00:00Z","genre_tags":["Dance/Electronic","Melodic Bass"]},
        {"provider_event_id":"Z7r9jZ1A7-YOx","title":"Thievery Corporation","venue_name":"Ventura Music Hall","city":"Ventura","region":"CA","country":"US","starts_at":"2026-06-03T03:00:00Z","genre_tags":["Dance/Electronic","Downtempo"]},
        {"provider_event_id":"vv1AaZko0GkdPPsTL","title":"Thievery Corporation - 30th Anniversary","venue_name":"The Observatory","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-06-04T02:00:00Z","genre_tags":["Dance/Electronic","Downtempo"]},
        {"provider_event_id":"rZ7HnEZ1AfqbGS","title":"TOBEHONEST","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-06-06T05:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfqSoS","title":"Eli & Fur","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-06-07T05:00:00Z","genre_tags":["House","Club Dance","Dance/Electronic"]},
        {"provider_event_id":"vv1AaZkosGkeHN_EE","title":"Earlybirds Club - 21+","venue_name":"The Observatory","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-06-13T01:00:00Z","genre_tags":["Club Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfkFo7","title":"VTSS","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-06-13T05:00:00Z","genre_tags":["Techno","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Afr44S","title":"Marie Vaunt","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-06-13T05:00:00Z","genre_tags":["Techno","Dance/Electronic"]},
        {"provider_event_id":"vv170Z_dGkBLwt3o","title":"Said the Sky","venue_name":"Hollywood Palladium","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-06-14T03:00:00Z","genre_tags":["Club Dance","Melodic Bass","Dance/Electronic"]},
        {"provider_event_id":"vvG1iZbzC8CKoZ","title":"Apocalypse Zombie Land","venue_name":"The Queen Mary","city":"Long Beach","region":"CA","country":"US","starts_at":"2026-06-19T23:00:00Z","genre_tags":["Dance/Electronic","Bass","Techno"]},
        {"provider_event_id":"vv1AaZk8MGkdaJ0Ep","title":"DILLSTRADAMUS (Dillon Francis B2B Flosstradamus)","venue_name":"Hollywood Palladium","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-06-28T03:00:00Z","genre_tags":["Club Dance","Festival EDM","Dance/Electronic"]}
      ]'::jsonb
    ) as x(
      provider_event_id text,
      title text,
      venue_name text,
      city text,
      region text,
      country text,
      starts_at timestamptz,
      genre_tags text[]
    )
  loop
    select es.event_id
      into v_event_id
    from public.event_sources es
    where es.provider = 'ticketmaster'
      and es.provider_event_id = rec.provider_event_id;

    if v_event_id is null then
      insert into public.events (
        title,
        venue_name,
        city,
        region,
        country,
        starts_at,
        genre_tags,
        source_primary
      )
      values (
        rec.title,
        rec.venue_name,
        rec.city,
        rec.region,
        rec.country,
        rec.starts_at,
        rec.genre_tags,
        'ticketmaster'
      )
      returning id into v_event_id;

      insert into public.event_sources (
        event_id,
        provider,
        provider_event_id,
        raw_payload
      )
      values (
        v_event_id,
        'ticketmaster',
        rec.provider_event_id,
        jsonb_build_object(
          'provider_event_id', rec.provider_event_id,
          'import_source', 'manual_backfill',
          'imported_at', now()
        )
      );
    else
      update public.events
      set
        title = rec.title,
        venue_name = rec.venue_name,
        city = rec.city,
        region = rec.region,
        country = rec.country,
        starts_at = rec.starts_at,
        genre_tags = rec.genre_tags,
        source_primary = 'ticketmaster',
        updated_at = now()
      where id = v_event_id;

      update public.event_sources
      set
        fetched_at = now(),
        raw_payload = jsonb_build_object(
          'provider_event_id', rec.provider_event_id,
          'import_source', 'manual_backfill',
          'imported_at', now()
        )
      where event_id = v_event_id
        and provider = 'ticketmaster'
        and provider_event_id = rec.provider_event_id;
    end if;
  end loop;
end
$$;
