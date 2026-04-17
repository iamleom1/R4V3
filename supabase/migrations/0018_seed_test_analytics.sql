insert into public.analytics_events (profile_id, event_name, properties, created_at)
values
  (null, 'auth_session_restored', '{"source":"seed","platform":"ios"}'::jsonb, now() - interval '6 hours'),
  (null, 'auth_session_restored', '{"source":"seed","platform":"android"}'::jsonb, now() - interval '5 hours'),
  (null, 'email_link_sent', '{"source":"seed","screen":"auth"}'::jsonb, now() - interval '4 hours'),
  (null, 'password_login_requested', '{"source":"seed","screen":"auth"}'::jsonb, now() - interval '3 hours 30 minutes'),
  (null, 'password_login_failed', '{"source":"seed","message":"Invalid login credentials"}'::jsonb, now() - interval '3 hours 20 minutes'),
  (null, 'event_detail_opened', '{"source":"seed","event_id":"demo-warehouse"}'::jsonb, now() - interval '2 hours 45 minutes'),
  (null, 'event_detail_opened', '{"source":"seed","event_id":"demo-rooftop"}'::jsonb, now() - interval '2 hours 10 minutes'),
  (null, 'event_rsvp_tapped', '{"source":"seed","event_id":"demo-warehouse","intent":"going"}'::jsonb, now() - interval '95 minutes'),
  (null, 'event_rsvp_tapped', '{"source":"seed","event_id":"demo-rooftop","intent":"going"}'::jsonb, now() - interval '80 minutes'),
  (null, 'crew_match_opened', '{"source":"seed","event_id":"demo-warehouse"}'::jsonb, now() - interval '70 minutes'),
  (null, 'crew_match_opened', '{"source":"seed","event_id":"demo-rooftop"}'::jsonb, now() - interval '55 minutes'),
  (null, 'onboarding_completed', '{"source":"seed","vibe_count":3,"genre_count":2}'::jsonb, now() - interval '30 minutes');

insert into public.client_errors (profile_id, message, stack, context, is_fatal, created_at)
values
  (null, 'Network request failed', 'TypeError: Network request failed
    at fetch', '{"source":"seed","screen":"EventDiscovery"}'::jsonb, false, now() - interval '2 hours 20 minutes'),
  (null, 'Failed to load moderation queue', 'Error: moderator_required
    at loadQueue', '{"source":"seed","screen":"ModerationQueue"}'::jsonb, false, now() - interval '1 hour 50 minutes'),
  (null, 'Unhandled promise rejection', 'Error: seed fatal crash
    at AppProvider', '{"source":"seed","screen":"AppProvider"}'::jsonb, true, now() - interval '1 hour 5 minutes'),
  (null, 'Image upload timeout', 'Error: Request timed out
    at uploadPhoto', '{"source":"seed","screen":"ProfilePhotos"}'::jsonb, false, now() - interval '35 minutes');

insert into public.job_runs (job_name, status, details, created_at)
values
  ('ingest-events', 'success', '{"source":"seed","inserted":24,"updated":3}'::jsonb, now() - interval '7 hours'),
  ('prune-events', 'success', '{"source":"seed","deleted":11}'::jsonb, now() - interval '6 hours 30 minutes'),
  ('ops-monitor', 'success', '{"source":"seed","alerts_created":1}'::jsonb, now() - interval '45 minutes'),
  ('ingest-events', 'failure', '{"source":"seed","reason":"ticket provider timeout"}'::jsonb, now() - interval '20 minutes');

insert into public.system_alerts (category, severity, status, message, details, created_at)
values
  ('job_health', 'critical', 'open', 'ingest-events stale or failing', '{"source":"seed","job_name":"ingest-events","latest_status":"failure"}'::jsonb, now() - interval '18 minutes'),
  ('event_inventory', 'warning', 'open', 'upcoming events below threshold', '{"source":"seed","upcoming_events":2,"minimum_upcoming_events":5}'::jsonb, now() - interval '12 minutes');
