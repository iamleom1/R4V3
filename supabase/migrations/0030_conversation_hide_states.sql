create table if not exists public.conversation_hidden_states (
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hidden_before_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

create index if not exists conversation_hidden_states_profile_hidden_idx
  on public.conversation_hidden_states (profile_id, hidden_before_at desc);

drop trigger if exists conversation_hidden_states_set_updated_at on public.conversation_hidden_states;
create trigger conversation_hidden_states_set_updated_at
before update on public.conversation_hidden_states
for each row execute function public.set_updated_at();

alter table public.conversation_hidden_states enable row level security;
alter table public.conversation_hidden_states force row level security;

drop policy if exists "conversation_hidden_states_select_self_participant" on public.conversation_hidden_states;
create policy "conversation_hidden_states_select_self_participant" on public.conversation_hidden_states
for select
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.conversation_hidden_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

drop policy if exists "conversation_hidden_states_insert_self_participant" on public.conversation_hidden_states;
create policy "conversation_hidden_states_insert_self_participant" on public.conversation_hidden_states
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.conversation_hidden_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

drop policy if exists "conversation_hidden_states_update_self_participant" on public.conversation_hidden_states;
create policy "conversation_hidden_states_update_self_participant" on public.conversation_hidden_states
for update
to authenticated
using (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.conversation_hidden_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
)
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.matches m
    where m.id = public.conversation_hidden_states.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

create or replace function public.hide_conversation(p_match_id uuid)
returns public.conversation_hidden_states
language plpgsql
security invoker
as $$
declare
  v_profile_id uuid := auth.uid();
  v_hidden_before_at timestamptz;
  v_row public.conversation_hidden_states;
begin
  if v_profile_id is null then
    raise exception 'Authentication required.';
  end if;

  select greatest(
    m.created_at,
    coalesce(max(msg.created_at), m.created_at)
  )
    into v_hidden_before_at
  from public.matches m
  left join public.messages msg
    on msg.match_id = m.id
   and msg.deleted_at is null
  where m.id = p_match_id
    and (m.profile_low_id = v_profile_id or m.profile_high_id = v_profile_id)
  group by m.id, m.created_at;

  if v_hidden_before_at is null then
    raise exception 'Conversation not found.';
  end if;

  insert into public.conversation_hidden_states (match_id, profile_id, hidden_before_at)
  values (p_match_id, v_profile_id, v_hidden_before_at)
  on conflict (match_id, profile_id)
  do update set
    hidden_before_at = excluded.hidden_before_at,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.hide_conversation(uuid) to authenticated;

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
  left join public.conversation_hidden_states chs
    on chs.match_id = mm.id
   and chs.profile_id = v.id
  where chs.hidden_before_at is null
     or coalesce(lm.created_at, mm.created_at) > chs.hidden_before_at
  order by coalesce(lm.created_at, mm.created_at) desc;
$$;
