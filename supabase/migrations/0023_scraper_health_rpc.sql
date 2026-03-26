create or replace function public.get_scraper_health_snapshot()
returns table (
  latest_status text,
  latest_run_at timestamptz,
  latest_success_at timestamptz,
  latest_fetched bigint,
  latest_inserted bigint,
  latest_updated bigint,
  latest_by_source jsonb,
  upcoming_posh_events bigint,
  upcoming_dice_events bigint,
  open_alerts bigint
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
  with latest_run as (
    select *
    from public.job_runs
    where job_name = 'ingest-edm-events'
    order by created_at desc
    limit 1
  ),
  latest_success as (
    select created_at
    from public.job_runs
    where job_name = 'ingest-edm-events'
      and status = 'success'
    order by created_at desc
    limit 1
  )
  select
    lr.status,
    lr.created_at,
    ls.created_at,
    coalesce((lr.details ->> 'fetched')::bigint, 0),
    coalesce((lr.details ->> 'inserted')::bigint, 0),
    coalesce((lr.details ->> 'updated')::bigint, 0),
    coalesce(lr.details -> 'by_source', '{}'::jsonb),
    (select count(*)::bigint from public.events where source_primary = 'posh' and starts_at >= now()) as upcoming_posh_events,
    (select count(*)::bigint from public.events where source_primary = 'dice' and starts_at >= now()) as upcoming_dice_events,
    (
      select count(*)::bigint
      from public.system_alerts
      where status = 'open'
        and category in ('edm_scraper_job_health', 'edm_scraper_volume', 'edm_scraper_inventory')
    ) as open_alerts
  from latest_run lr
  left join latest_success ls on true;
end;
$$;

grant execute on function public.get_scraper_health_snapshot() to authenticated;

create or replace function public.list_scraper_job_runs(
  p_limit int default 12
)
returns table (
  status text,
  created_at timestamptz,
  fetched bigint,
  inserted bigint,
  updated bigint,
  by_source jsonb
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
    jr.status,
    jr.created_at,
    coalesce((jr.details ->> 'fetched')::bigint, 0) as fetched,
    coalesce((jr.details ->> 'inserted')::bigint, 0) as inserted,
    coalesce((jr.details ->> 'updated')::bigint, 0) as updated,
    coalesce(jr.details -> 'by_source', '{}'::jsonb) as by_source
  from public.job_runs jr
  where jr.job_name = 'ingest-edm-events'
  order by jr.created_at desc
  limit greatest(coalesce(p_limit, 12), 1);
end;
$$;

grant execute on function public.list_scraper_job_runs(int) to authenticated;
