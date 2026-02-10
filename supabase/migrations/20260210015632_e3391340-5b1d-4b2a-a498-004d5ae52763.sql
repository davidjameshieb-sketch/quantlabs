
CREATE OR REPLACE FUNCTION public.get_agent_simulator_stats(p_user_id uuid)
 RETURNS TABLE(agent_id text, total_trades bigint, win_count bigint, net_pips double precision, gross_profit double precision, gross_loss double precision, long_count bigint, long_wins bigint, long_net double precision, short_count bigint, short_wins bigint, short_net double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      o.agent_id,
      o.direction,
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
      AND o.agent_id NOT IN ('manual-test', 'unknown', 'backtest-engine')
  )
  SELECT
    b.agent_id,
    COUNT(*)::bigint as total_trades,
    COUNT(*) FILTER (WHERE b.pips > 0)::bigint as win_count,
    COALESCE(SUM(b.pips), 0)::float8 as net_pips,
    COALESCE(SUM(b.pips) FILTER (WHERE b.pips > 0), 0)::float8 as gross_profit,
    COALESCE(ABS(SUM(b.pips) FILTER (WHERE b.pips <= 0)), 0)::float8 as gross_loss,
    COUNT(*) FILTER (WHERE b.direction = 'long')::bigint as long_count,
    COUNT(*) FILTER (WHERE b.direction = 'long' AND b.pips > 0)::bigint as long_wins,
    COALESCE(SUM(b.pips) FILTER (WHERE b.direction = 'long'), 0)::float8 as long_net,
    COUNT(*) FILTER (WHERE b.direction = 'short')::bigint as short_count,
    COUNT(*) FILTER (WHERE b.direction = 'short' AND b.pips > 0)::bigint as short_wins,
    COALESCE(SUM(b.pips) FILTER (WHERE b.direction = 'short'), 0)::float8 as short_net
  FROM base b
  GROUP BY b.agent_id
$function$;
