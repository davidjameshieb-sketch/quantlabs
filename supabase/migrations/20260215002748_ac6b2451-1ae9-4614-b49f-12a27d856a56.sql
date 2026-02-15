-- Schedule fast-poll trigger evaluator every 10 seconds
SELECT cron.schedule(
  'fast-poll-triggers',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := 'https://guswjpdwfcrvjqzjswnv.supabase.co/functions/v1/fast-poll-triggers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1c3dqcGR3ZmNydmpxempzd252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODM2NzUsImV4cCI6MjA4NTM1OTY3NX0.6jj89RLQfuBZ6Ak9qWf9dfNNFildPkzg3McttC-RNUU'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule macro-nlp-pipeline every 4 hours
SELECT cron.schedule(
  'macro-nlp-pipeline',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://guswjpdwfcrvjqzjswnv.supabase.co/functions/v1/macro-nlp-pipeline',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1c3dqcGR3ZmNydmpxempzd252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODM2NzUsImV4cCI6MjA4NTM1OTY3NX0.6jj89RLQfuBZ6Ak9qWf9dfNNFildPkzg3McttC-RNUU'
    ),
    body := '{}'::jsonb
  );
  $$
);