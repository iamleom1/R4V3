-- Optimize conversation list fetching by returning one row per match
-- with latest message + read state in a single RPC.

create index if not exists matches_profile_low_created_idx
  on public.matches (profile_low_id, created_at desc);

create index if not exists matches_profile_high_created_idx
  on public.matches (profile_high_id, created_at desc);

create index if not exists message_read_states_profile_match_idx
  on public.message_read_states (profile_id, match_id);

create or replace function public.list_conversations(p_limit int default 100)
returns table (
  match_id uuid,
  mode text,
  event_name text,
  other_profile_id uuid,
  other_display_name text,
  other_city text,
  other_vibe_tags text[],
  matched_at timestamptz,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_profile_id uuid,
  last_read_at timestamptz,
  is_unread boolean
)
language sql
security invoker
as $$
  with viewer as (
    select auth.uid() as id
  ),
  my_matches as (
    select
      m.id,
      m.mode,
      m.event_id,
      m.created_at,
      case when m.profile_low_id = v.id then m.profile_high_id else m.profile_low_id end as other_profile_id
    from public.matches m
    cross join viewer v
    where m.profile_low_id = v.id or m.profile_high_id = v.id
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  )
  select
    mm.id as match_id,
    mm.mode,
    e.title as event_name,
    mm.other_profile_id,
    coalesce(p.display_name, 'R4V3 User') as other_display_name,
    p.city as other_city,
    coalesce(p.vibe_tags, '{}'::text[]) as other_vibe_tags,
    mm.created_at as matched_at,
    lm.body as last_message_body,
    lm.created_at as last_message_at,
    lm.sender_profile_id as last_message_sender_profile_id,
    mrs.last_read_at,
    (
      lm.created_at is not null
      and lm.sender_profile_id is not null
      and lm.sender_profile_id <> v.id
      and (mrs.last_read_at is null or lm.created_at > mrs.last_read_at)
    ) as is_unread
  from my_matches mm
  cross join viewer v
  left join public.profiles p on p.id = mm.other_profile_id
  left join public.events e on e.id = mm.event_id
  left join lateral (
    select msg.sender_profile_id, msg.body, msg.created_at
    from public.messages msg
    where msg.match_id = mm.id
      and msg.deleted_at is null
    order by msg.created_at desc
    limit 1
  ) lm on true
  left join public.message_read_states mrs
    on mrs.match_id = mm.id
   and mrs.profile_id = v.id
  order by coalesce(lm.created_at, mm.created_at) desc;
$$;

grant execute on function public.list_conversations(int) to authenticated;
