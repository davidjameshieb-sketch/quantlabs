
-- Circuit Breaker DB Trigger
-- Monitors NAV drawdown and instantly disables all agents by inserting a CIRCUIT_BREAKER gate_bypass

-- Create a function that checks for rapid NAV decline and activates circuit breaker
CREATE OR REPLACE FUNCTION public.check_nav_circuit_breaker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recent_losses numeric;
  loss_count integer;
  breaker_exists boolean;
BEGIN
  -- Only trigger on closed/filled trades with exit prices (i.e., completed trades)
  IF NEW.status NOT IN ('filled', 'closed') OR NEW.exit_price IS NULL OR NEW.entry_price IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if a circuit breaker is already active
  SELECT EXISTS(
    SELECT 1 FROM gate_bypasses 
    WHERE gate_id LIKE 'CIRCUIT_BREAKER:%' 
    AND revoked = false 
    AND expires_at > now()
  ) INTO breaker_exists;
  
  IF breaker_exists THEN
    RETURN NEW;
  END IF;

  -- Calculate net pips lost in last 1 hour
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN currency_pair IN ('USD_JPY','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY','CHF_JPY','NZD_JPY') THEN
          CASE WHEN direction = 'long' THEN (exit_price - entry_price) * 100
               ELSE (entry_price - exit_price) * 100 END
        ELSE
          CASE WHEN direction = 'long' THEN (exit_price - entry_price) * 10000
               ELSE (entry_price - exit_price) * 10000 END
      END
    ), 0),
    COUNT(*)
  INTO recent_losses, loss_count
  FROM oanda_orders
  WHERE status IN ('filled', 'closed')
    AND exit_price IS NOT NULL
    AND entry_price IS NOT NULL
    AND closed_at > now() - interval '1 hour'
    AND environment = NEW.environment;

  -- Activate circuit breaker if net loss exceeds -40 pips in 1h (approx 5% on small account)
  IF recent_losses < -40 THEN
    INSERT INTO gate_bypasses (gate_id, reason, expires_at, pair, created_by)
    VALUES (
      'CIRCUIT_BREAKER:nav_drawdown_trigger',
      format('DB TRIGGER: %.1f pips lost in 1h (%s trades). All trading halted.', recent_losses, loss_count),
      now() + interval '4 hours',
      NULL,
      'db-trigger'
    );
    
    -- Also suspend all active agents
    INSERT INTO gate_bypasses (gate_id, reason, expires_at, pair, created_by)
    VALUES (
      'AGENT_SUSPEND:all_agents_circuit_breaker',
      format('DB TRIGGER: Circuit breaker activated. %.1f pips lost in 1h.', recent_losses),
      now() + interval '4 hours',
      NULL,
      'db-trigger'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on oanda_orders
DROP TRIGGER IF EXISTS trg_nav_circuit_breaker ON oanda_orders;
CREATE TRIGGER trg_nav_circuit_breaker
AFTER UPDATE OF status, exit_price ON oanda_orders
FOR EACH ROW
EXECUTE FUNCTION public.check_nav_circuit_breaker();
