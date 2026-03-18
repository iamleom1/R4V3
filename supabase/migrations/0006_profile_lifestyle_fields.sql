-- Additional editable profile fields for personal info UI.

alter table public.profiles
  add column if not exists gender text,
  add column if not exists smoking_preference text,
  add column if not exists drinking_preference text;
