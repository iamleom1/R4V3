alter table public.event_rooms
  drop constraint if exists event_rooms_event_id_key;

alter table public.event_rooms
  add column if not exists title text,
  add column if not exists meetup_note text,
  add column if not exists size_cap int not null default 6,
  add column if not exists is_open boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_rooms_size_cap_check'
      and conrelid = 'public.event_rooms'::regclass
  ) then
    alter table public.event_rooms
      add constraint event_rooms_size_cap_check
      check (size_cap between 2 and 24);
  end if;
end $$;

update public.event_rooms
set title = coalesce(nullif(title, ''), 'Open crew')
where title is null or title = '';

create index if not exists event_rooms_event_created_idx
  on public.event_rooms (event_id, created_at desc);

create table if not exists public.event_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.event_rooms(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists event_room_messages_room_created_idx
  on public.event_room_messages (room_id, created_at desc)
  where deleted_at is null;

alter table public.event_room_messages enable row level security;
alter table public.event_room_messages force row level security;

drop policy if exists "event_room_messages_select_member" on public.event_room_messages;
create policy "event_room_messages_select_member" on public.event_room_messages
for select to authenticated
using (
  exists (
    select 1
    from public.event_room_members erm
    where erm.room_id = public.event_room_messages.room_id
      and erm.profile_id = auth.uid()
  )
);

drop policy if exists "event_room_messages_insert_member" on public.event_room_messages;
create policy "event_room_messages_insert_member" on public.event_room_messages
for insert to authenticated
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.event_room_members erm
    where erm.room_id = public.event_room_messages.room_id
      and erm.profile_id = auth.uid()
  )
);
