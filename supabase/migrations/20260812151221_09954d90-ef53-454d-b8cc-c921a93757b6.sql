CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('frenet-tracking-poll') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'frenet-tracking-poll');

SELECT cron.schedule(
  'frenet-tracking-poll',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/hooks/frenet-tracking',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cmZtZm96cWRndnRpYW5tamN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTA2MDIsImV4cCI6MjA5NDc4NjYwMn0.DzJwAtHe4ij03nYpdQNRUWgpKZ_lRYLJdxfgDnIvrAE"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  ) as request_id;
  $$
);