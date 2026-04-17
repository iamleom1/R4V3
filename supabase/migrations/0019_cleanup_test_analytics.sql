delete from public.system_alerts
where details ->> 'source' = 'seed';

delete from public.job_runs
where details ->> 'source' = 'seed';

delete from public.client_errors
where context ->> 'source' = 'seed';

delete from public.analytics_events
where properties ->> 'source' = 'seed';
