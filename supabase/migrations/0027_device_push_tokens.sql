create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'unknown',
  project_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (platform in ('ios', 'android', 'unknown'))
);

create index if not exists device_push_tokens_profile_last_seen_idx
  on public.device_push_tokens (profile_id, last_seen_at desc);

drop trigger if exists device_push_tokens_set_updated_at on public.device_push_tokens;
create trigger device_push_tokens_set_updated_at
before update on public.device_push_tokens
for each row execute function public.set_updated_at();

alter table public.device_push_tokens enable row level security;
alter table public.device_push_tokens force row level security;

drop policy if exists "device_push_tokens_select_self" on public.device_push_tokens;
create policy "device_push_tokens_select_self" on public.device_push_tokens
for select
using (profile_id = auth.uid());

drop policy if exists "device_push_tokens_insert_self" on public.device_push_tokens;
create policy "device_push_tokens_insert_self" on public.device_push_tokens
for insert
with check (profile_id = auth.uid());

drop policy if exists "device_push_tokens_update_self" on public.device_push_tokens;
create policy "device_push_tokens_update_self" on public.device_push_tokens
for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "device_push_tokens_delete_self" on public.device_push_tokens;
create policy "device_push_tokens_delete_self" on public.device_push_tokens
for delete
using (profile_id = auth.uid());
