alter table public.events
  add column if not exists flyer_url text;

drop function if exists public.list_curated_events(boolean, int);

create or replace function public.list_curated_events(
  p_include_past boolean default false,
  p_limit int default 100
)
returns table (
  event_id uuid,
  title text,
  venue_name text,
  city text,
  starts_at timestamptz,
  ends_at timestamptz,
  genre_tags text[],
  source_primary text,
  is_featured boolean,
  promotion_rank int,
  featured_until timestamptz,
  curation_note text,
  flyer_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  return query
  select
    e.id,
    e.title,
    e.venue_name,
    e.city,
    e.starts_at,
    e.ends_at,
    e.genre_tags,
    e.source_primary,
    e.is_featured,
    e.promotion_rank,
    e.featured_until,
    e.curation_note,
    e.flyer_url
  from public.events e
  where p_include_past or e.starts_at >= now()
  order by
    e.is_featured desc,
    e.promotion_rank desc,
    e.starts_at asc
  limit greatest(coalesce(p_limit, 100), 1);
end;
$$;

grant execute on function public.list_curated_events(boolean, int) to authenticated;

drop function if exists public.upsert_curated_event(uuid, text, text, text, text, text, timestamptz, timestamptz, text[], text, boolean, int, timestamptz, text);

create or replace function public.upsert_curated_event(
  p_event_id uuid default null,
  p_title text default null,
  p_venue_name text default null,
  p_city text default null,
  p_region text default 'CA',
  p_country text default 'US',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_genre_tags text[] default '{}'::text[],
  p_source_primary text default 'manual',
  p_is_featured boolean default false,
  p_promotion_rank int default 0,
  p_featured_until timestamptz default null,
  p_curation_note text default null,
  p_flyer_url text default null
)
returns table (
  event_id uuid,
  title text,
  source_primary text,
  is_featured boolean,
  promotion_rank int,
  featured_until timestamptz,
  flyer_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_source text := lower(coalesce(p_source_primary, 'manual'));
  v_duplicate_id uuid;
begin
  if not public.is_current_user_moderator() then
    raise exception 'moderator_required';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title_required';
  end if;

  if p_starts_at is null then
    raise exception 'starts_at_required';
  end if;

  if v_source not in ('ticketmaster', 'seatgeek', 'manual') then
    raise exception 'invalid_source_primary';
  end if;

  select e.id
  into v_duplicate_id
  from public.events e
  where (p_event_id is null or e.id <> p_event_id)
    and lower(trim(e.title)) = lower(trim(p_title))
    and coalesce(lower(trim(e.city)), '') = coalesce(lower(trim(p_city)), '')
    and abs(extract(epoch from (e.starts_at - p_starts_at))) <= 21600
  limit 1;

  if v_duplicate_id is not null then
    raise exception 'duplicate_event:%', v_duplicate_id;
  end if;

  if p_event_id is null then
    insert into public.events (
      title,
      venue_name,
      city,
      region,
      country,
      starts_at,
      ends_at,
      genre_tags,
      source_primary,
      is_featured,
      promotion_rank,
      featured_until,
      curation_note,
      flyer_url
    )
    values (
      trim(p_title),
      nullif(trim(coalesce(p_venue_name, '')), ''),
      nullif(trim(coalesce(p_city, '')), ''),
      nullif(trim(coalesce(p_region, '')), ''),
      nullif(trim(coalesce(p_country, '')), ''),
      p_starts_at,
      p_ends_at,
      coalesce(p_genre_tags, '{}'::text[]),
      v_source,
      coalesce(p_is_featured, false),
      greatest(0, least(coalesce(p_promotion_rank, 0), 100)),
      p_featured_until,
      nullif(trim(coalesce(p_curation_note, '')), ''),
      nullif(trim(coalesce(p_flyer_url, '')), '')
    )
    returning id into v_event_id;
  else
    update public.events
    set
      title = trim(p_title),
      venue_name = nullif(trim(coalesce(p_venue_name, '')), ''),
      city = nullif(trim(coalesce(p_city, '')), ''),
      region = nullif(trim(coalesce(p_region, '')), ''),
      country = nullif(trim(coalesce(p_country, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      genre_tags = coalesce(p_genre_tags, '{}'::text[]),
      source_primary = v_source,
      is_featured = coalesce(p_is_featured, false),
      promotion_rank = greatest(0, least(coalesce(p_promotion_rank, 0), 100)),
      featured_until = p_featured_until,
      curation_note = nullif(trim(coalesce(p_curation_note, '')), ''),
      flyer_url = nullif(trim(coalesce(p_flyer_url, '')), ''),
      updated_at = now()
    where id = p_event_id
    returning id into v_event_id;

    if v_event_id is null then
      raise exception 'event_not_found';
    end if;
  end if;

  return query
  select
    e.id,
    e.title,
    e.source_primary,
    e.is_featured,
    e.promotion_rank,
    e.featured_until,
    e.flyer_url
  from public.events e
  where e.id = v_event_id;
end;
$$;

grant execute on function public.upsert_curated_event(uuid, text, text, text, text, text, timestamptz, timestamptz, text[], text, boolean, int, timestamptz, text, text) to authenticated;
