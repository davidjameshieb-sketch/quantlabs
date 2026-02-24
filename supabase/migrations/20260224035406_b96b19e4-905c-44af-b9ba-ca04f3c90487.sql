-- Schedule decorrelated-blend-executor every 10 minutes for Atlas Hedge portfolio auto-trading
SELECT cron.schedule(
  'blend-executor-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://guswjpdwfcrvjqzjswnv.supabase.co/functions/v1/decorrelated-blend-executor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1c3dqcGR3ZmNydmpxempzd252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODM2NzUsImV4cCI6MjA4NTM1OTY3NX0.6jj89RLQfuBZ6Ak9qWf9dfNNFildPkzg3McttC-RNUU',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1c3dqcGR3ZmNydmpxempzd252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODM2NzUsImV4cCI6MjA4NTM1OTY3NX0.6jj89RLQfuBZ6Ak9qWf9dfNNFildPkzg3McttC-RNUU'
    ),
    body := '{}'::jsonb
  );
  $$
);