CREATE OR REPLACE FUNCTION public.check_nav_circuit_breaker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  recent_losses numeric;
  loss_count integer;
  breaker_exists boolean;
BEGIN
  IF NEW.status NOT IN ('filled', 'closed') OR NEW.exit_price IS NULL OR NEW.entry_price IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM gate_bypasses 
    WHERE gate_id LIKE 'CIRCUIT_BREAKER:%' 
    AND revoked = false 
    AND expires_at > now()
  ) INTO breaker_exists;
  
  IF breaker_exists THEN
    RETURN NEW;
  END IF;

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

  IF recent_losses < -40 THEN
    INSERT INTO gate_bypasses (gate_id, reason, expires_at, pair, created_by)
    VALUES (
      'CIRCUIT_BREAKER:nav_drawdown_trigger',
      'DB TRIGGER: ' || round(recent_losses, 1)::text || ' pips lost in 1h (' || loss_count::text || ' trades). All trading halted.',
      now() + interval '4 hours',
      NULL,
      'db-trigger'
    );
    
    INSERT INTO gate_bypasses (gate_id, reason, expires_at, pair, created_by)
    VALUES (
      'AGENT_SUSPEND:all_agents_circuit_breaker',
      'DB TRIGGER: Circuit breaker activated. ' || round(recent_losses, 1)::text || ' pips lost in 1h.',
      now() + interval '4 hours',
      NULL,
      'db-trigger'
    );
  END IF;

  RETURN NEW;
END;
$function$;