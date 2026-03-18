-- Harden server-side enforcement for chat access:
-- only participants in a mutual match can read/send messages for that match.

alter table public.matches enable row level security;
alter table public.messages enable row level security;

-- Force RLS so table owners do not accidentally bypass policies in app-facing roles.
alter table public.matches force row level security;
alter table public.messages force row level security;

-- Recreate participant-only policies idempotently to ensure they exist in all environments.
drop policy if exists "matches_select_participant" on public.matches;
create policy "matches_select_participant" on public.matches
for select
to authenticated
using (profile_low_id = auth.uid() or profile_high_id = auth.uid());

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = public.messages.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);

drop policy if exists "messages_insert_sender_participant" on public.messages;
create policy "messages_insert_sender_participant" on public.messages
for insert
to authenticated
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.matches m
    where m.id = public.messages.match_id
      and (m.profile_low_id = auth.uid() or m.profile_high_id = auth.uid())
  )
);
