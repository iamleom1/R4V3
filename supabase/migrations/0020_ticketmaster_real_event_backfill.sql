do $$
declare
  rec record;
  v_event_id uuid;
begin
  for rec in
    select *
    from jsonb_to_recordset(
      '[
        {"provider_event_id":"vv170ZbzGknGQkx7","title":"Beyond Wonderland Southern California","venue_name":"NOS Events Center","city":"San Bernardino","region":"CA","country":"US","starts_at":"2026-03-27T22:00:00Z","genre_tags":["Dance/Electronic","Club Dance","House","Drum & Bass"]},
        {"provider_event_id":"Z7r9jZ1A7OaJ9","title":"Earlybirds Club","venue_name":"Music Box - San Diego","city":"San Diego","region":"CA","country":"US","starts_at":"2026-03-28T01:00:00Z","genre_tags":["Dance/Electronic","Club Dance"]},
        {"provider_event_id":"rZ7HnEZ1AKJ8P7","title":"Earlybirds Club - Dance Party","venue_name":"Music Box","city":"San Diego","region":"CA","country":"US","starts_at":"2026-03-28T01:00:00Z","genre_tags":["Dance Pop","Dance/Electronic"]},
        {"provider_event_id":"vv1AaZk8gGkdARb8H","title":"Hippie Sabotage: Give and Take Tour","venue_name":"The Belasco","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-03-28T02:00:00Z","genre_tags":["Electro Pop","Club Dance","Dance/Electronic"]},
        {"provider_event_id":"vv170Z_AGkRb77ko","title":"Reggaeton Rave (18+)","venue_name":"The Observatory","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-03-28T04:00:00Z","genre_tags":["Dance/Electronic","Electro Pop"]},
        {"provider_event_id":"vvG1IZ_AxuPvCK","title":"Punchis! Punchis! Banda Rave Experience (18+ w/ ID)","venue_name":"House of Blues San Diego","city":"San Diego","region":"CA","country":"US","starts_at":"2026-03-28T04:00:00Z","genre_tags":["Latin Electronica","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Afq9GN","title":"Space Yacht: Tech My House w/ Speed Freak","venue_name":"The Loft at Academy LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-03-28T05:00:00Z","genre_tags":["Dance/Electronic","Tech House"]},
        {"provider_event_id":"rZ7HnEZ1Afq9Gd","title":"Flashback: A 2010s EDM Tribute Party","venue_name":"Exchange LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-03-28T05:00:00Z","genre_tags":["Dance/Electronic","Dance Pop"]},
        {"provider_event_id":"rZ7HnEZ1AfAVu0","title":"NOTD","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-03-28T05:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"vvG1IZ_Anqq6vE","title":"Blade Rave (21+ w/ ID)","venue_name":"House of Blues San Diego","city":"San Diego","region":"CA","country":"US","starts_at":"2026-03-29T03:00:00Z","genre_tags":["Techno-House","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Afrv_d","title":"SIDEPIECE","venue_name":"Academy LA","city":"Los Angeles","region":"CA","country":"US","starts_at":"2026-03-29T05:00:00Z","genre_tags":["Tech-House","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfAVb7","title":"Space Yacht: Big Bass Ting","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-03-29T05:00:00Z","genre_tags":["House","Bass","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1Af7E80","title":"Sonny Fodera","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-04T05:00:00Z","genre_tags":["Dance/Electronic","House"]},
        {"provider_event_id":"rZ7HnEZ1Af7Vj7","title":"Will Sparks","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-04-04T05:00:00Z","genre_tags":["House","Club Dance","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfZNA0","title":"Shlump, Stylust","venue_name":"Music Box","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-05T04:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"rZ7HnEZ1Afeku0","title":"KSHMR","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-05T05:00:00Z","genre_tags":["Dance/Electronic"]},
        {"provider_event_id":"Z7r9jZ1A7Ot-t","title":"Disclosure","venue_name":"Santa Barbara Bowl","city":"Santa Barbara","region":"CA","country":"US","starts_at":"2026-04-08T02:00:00Z","genre_tags":["Dance/Electronic","Club Dance"]},
        {"provider_event_id":"vvG1IZ_d9wxuaj","title":"Black Coffee","venue_name":"The Rady Shell at Jacobs Park","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-10T22:00:00Z","genre_tags":["Club Dance","Dance/Electronic","House"]},
        {"provider_event_id":"vv1ke8v0f9GACSAeO","title":"Bassrush Presents SVDDEN DEATH","venue_name":"Hollywood Palladium","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-04-11T03:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"rZ7HnEZ1AfA8j0","title":"Jantsen, RUVLO, Phocust, Eklypse, Noahfence","venue_name":"Music Box","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-11T04:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"rZ7HnEZ1AfjMad","title":"Riot Ten","venue_name":"Nova SD","city":"San Diego","region":"CA","country":"US","starts_at":"2026-04-11T05:00:00Z","genre_tags":["Dub Electronica","Dance/Electronic"]},
        {"provider_event_id":"rZ7HnEZ1AfqSoN","title":"Sullivan King","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-04-11T05:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"rZ7HnEZ1AfZkOf","title":"Factor B + Lostly","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-04-12T05:00:00Z","genre_tags":["Trance","Dance/Electronic"]},
        {"provider_event_id":"Z7r9jZ1A7-O4w","title":"Subtronics (18+ Event)","venue_name":"The Fox Theater-Pomona","city":"Pomona","region":"CA","country":"US","starts_at":"2026-04-15T03:00:00Z","genre_tags":["Dance/Electronic","Bass"]},
        {"provider_event_id":"rZ7HnEZ1Afvzqf","title":"Sub Zero Project","venue_name":"Avalon Hollywood","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-04-18T05:00:00Z","genre_tags":["Dance/Electronic","Hard Dance"]},
        {"provider_event_id":"vv170ZbUGkTlCsun","title":"Barely Alive Presents: Overdrive Tour - 18+","venue_name":"The Observatory","city":"Santa Ana","region":"CA","country":"US","starts_at":"2026-04-19T03:00:00Z","genre_tags":["Dance/Electronic","Techno Bass","Club Dance"]},
        {"provider_event_id":"rZ7HnEZ1AfAf-V","title":"Cassian","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-04-25T05:00:00Z","genre_tags":["Dance/Electronic","Melodic House"]},
        {"provider_event_id":"vv1AaZkugGkezTi8m","title":"NGHTMRE Presents: MINDFULL","venue_name":"Hollywood Palladium","city":"Hollywood","region":"CA","country":"US","starts_at":"2026-04-26T03:00:00Z","genre_tags":["Dance/Electronic","Club Dance","Bass"]},
        {"provider_event_id":"rZ7HnEZ1AfA3Q7","title":"BOLO","venue_name":"Time Nightclub","city":"Costa Mesa","region":"CA","country":"US","starts_at":"2026-04-26T05:00:00Z","genre_tags":["House","Dance/Electronic"]}
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
