alter table public.promoter_sources
  drop constraint promoter_sources_provider_check;

alter table public.promoter_sources
  add constraint promoter_sources_provider_check
  check (provider in ('posh', 'dice'));

alter table public.promoter_sources drop column organizer_url;

alter table public.promoter_sources
  add column organizer_url text generated always as (
    case provider
      when 'posh' then 'https://posh.vip/g/' || organizer_slug
      when 'dice' then 'https://dice.fm/promoters/' || organizer_slug
    end
  ) stored;
