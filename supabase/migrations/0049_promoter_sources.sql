-- Managed through the Supabase dashboard. Clients cannot approve or edit sources.
create table public.promoter_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  provider text not null default 'posh' check (provider = 'posh'),
  organizer_slug text not null check (organizer_slug ~ '^[a-z0-9-]{1,100}$'),
  organizer_url text generated always as ('https://posh.vip/g/' || organizer_slug) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  enabled boolean not null default false,
  default_city text not null check (length(trim(default_city)) between 1 and 100),
  default_region text not null default 'CA',
  default_country text not null default 'US',
  last_fetched_at timestamptz,
  last_fetch_status text check (last_fetch_status in ('success', 'failure')),
  last_event_count integer check (last_event_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, organizer_slug),
  check (not enabled or status = 'approved')
);

alter table public.promoter_sources enable row level security;
revoke all on public.promoter_sources from anon, authenticated;
grant all on public.promoter_sources to service_role;

create trigger promoter_sources_set_updated_at
before update on public.promoter_sources
for each row execute function public.set_updated_at();

insert into public.promoter_sources
  (name, organizer_slug, status, enabled, default_city)
values ('TECHTONIK', 'techtonik', 'approved', true, 'Los Angeles');
