alter table public.profiles
  add column if not exists interested_genders text[] not null default '{}',
  add column if not exists preferred_age_min int,
  add column if not exists preferred_age_max int;
