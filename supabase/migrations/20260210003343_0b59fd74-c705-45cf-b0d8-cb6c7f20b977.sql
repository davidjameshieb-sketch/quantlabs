
DROP FUNCTION IF EXISTS public.get_agent_simulator_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_agent_simulator_stats(p_user_id uuid)
RETURNS TABLE (
  agent_id text,
  total_trades bigint,
  win_count bigint,
  loss_count bigint,
  gross_profit float8,
  gross_loss float8,
  net_pips float8,
  long_count bigint,
  long_wins bigint,
  long_net float8,
  short_count bigint,
  short_wins bigint,
  short_net float8,
  session_label text,
  session_net float8,
  session_wins bigint,
  session_total bigint,
  currency_pair text,
  pair_net float8,
  pair_gp float8,
  pair_gl float8,
  pair_total bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- Return per-agent + per-session + per-pair breakdown in one query
  WITH base AS (
    SELECT
      o.agent_id,
      o.currency_pair,
      o.direction,
      o.session_label,
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
  ),
  agent_stats AS (
    SELECT
      b.agent_id,
      COUNT(*) as total_trades,
      COUNT(*) FILTER (WHERE b.pips > 0) as win_count,
      COUNT(*) FILTER (WHERE b.pips <= 0) as loss_count,
      COALESCE(SUM(b.pips) FILTER (WHERE b.pips > 0), 0) as gross_profit,
      COALESCE(ABS(SUM(b.pips) FILTER (WHERE b.pips <= 0)), 0) as gross_loss,
      COALESCE(SUM(b.pips), 0) as net_pips,
      COUNT(*) FILTER (WHERE b.direction = 'long') as long_count,
      COUNT(*) FILTER (WHERE b.direction = 'long' AND b.pips > 0) as long_wins,
      COALESCE(SUM(b.pips) FILTER (WHERE b.direction = 'long'), 0) as long_net,
      COUNT(*) FILTER (WHERE b.direction = 'short') as short_count,
      COUNT(*) FILTER (WHERE b.direction = 'short' AND b.pips > 0) as short_wins,
      COALESCE(SUM(b.pips) FILTER (WHERE b.direction = 'short'), 0) as short_net
    FROM base b
    GROUP BY b.agent_id
  ),
  session_stats AS (
    SELECT
      b.agent_id,
      COALESCE(b.session_label, 'unknown') as session_label,
      COALESCE(SUM(b.pips), 0) as session_net,
      COUNT(*) FILTER (WHERE b.pips > 0) as session_wins,
      COUNT(*) as session_total
    FROM base b
    GROUP BY b.agent_id, COALESCE(b.session_label, 'unknown')
  ),
  pair_stats AS (
    SELECT
      b.agent_id,
      b.currency_pair,
      COALESCE(SUM(b.pips), 0) as pair_net,
      COALESCE(SUM(b.pips) FILTER (WHERE b.pips > 0), 0) as pair_gp,
      COALESCE(ABS(SUM(b.pips) FILTER (WHERE b.pips <= 0)), 0) as pair_gl,
      COUNT(*) as pair_total
    FROM base b
    GROUP BY b.agent_id, b.currency_pair
  )
  SELECT
    a.agent_id,
    a.total_trades, a.win_count, a.loss_count,
    a.gross_profit, a.gross_loss, a.net_pips,
    a.long_count, a.long_wins, a.long_net,
    a.short_count, a.short_wins, a.short_net,
    s.session_label, s.session_net, s.session_wins, s.session_total,
    p.currency_pair, p.pair_net, p.pair_gp, p.pair_gl, p.pair_total
  FROM agent_stats a
  LEFT JOIN session_stats s ON s.agent_id = a.agent_id
  LEFT JOIN pair_stats p ON p.agent_id = a.agent_id
$$;
