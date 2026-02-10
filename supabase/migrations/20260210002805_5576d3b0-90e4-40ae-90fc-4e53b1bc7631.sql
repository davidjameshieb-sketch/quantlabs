
CREATE OR REPLACE FUNCTION public.get_agent_simulator_stats(p_user_id uuid)
RETURNS TABLE (
  agent_id text,
  currency_pair text,
  direction text,
  session_label text,
  entry_price float8,
  exit_price float8,
  pips float8
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    o.agent_id,
    o.currency_pair,
    o.direction,
    o.session_label,
    o.entry_price,
    o.exit_price,
    CASE
      WHEN o.currency_pair IN ('USD_JPY','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY','CHF_JPY','NZD_JPY')
        THEN ROUND(CAST(
          CASE WHEN o.direction = 'long' THEN (o.exit_price - o.entry_price) * 100
               ELSE (o.entry_price - o.exit_price) * 100 END AS numeric), 1)
      ELSE ROUND(CAST(
          CASE WHEN o.direction = 'long' THEN (o.exit_price - o.entry_price) * 10000
               ELSE (o.entry_price - o.exit_price) * 10000 END AS numeric), 1)
    END as pips
  FROM oanda_orders o
  WHERE o.user_id = p_user_id
    AND o.status IN ('filled', 'closed')
    AND o.entry_price IS NOT NULL
    AND o.exit_price IS NOT NULL
    AND o.agent_id IS NOT NULL
    AND o.agent_id NOT IN ('manual-test', 'unknown')
$$;
