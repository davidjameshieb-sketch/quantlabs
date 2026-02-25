
CREATE OR REPLACE FUNCTION public.try_acquire_blend_slot(
  p_agent_id text,
  p_currency_pair text,
  p_user_id uuid,
  p_signal_id text,
  p_direction text,
  p_units integer,
  p_environment text,
  p_confidence_score numeric DEFAULT NULL,
  p_requested_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Serialize access per agent+pair using advisory lock (transaction-scoped)
  PERFORM pg_advisory_xact_lock(
    hashtext('blend_slot_' || p_agent_id || '_' || p_currency_pair)
  );

  -- Check if an order for this agent+pair is already active
  IF EXISTS (
    SELECT 1 FROM oanda_orders
    WHERE agent_id = p_agent_id
      AND currency_pair = p_currency_pair
      AND status IN ('open', 'submitted', 'filled')
      AND environment = p_environment
  ) THEN
    -- Return NULL to signal "slot occupied"
    RETURN NULL;
  END IF;

  -- Atomically insert the new order
  INSERT INTO oanda_orders (
    user_id, signal_id, currency_pair, direction, units,
    agent_id, environment, status, confidence_score, requested_price
  ) VALUES (
    p_user_id, p_signal_id, p_currency_pair, p_direction, p_units,
    p_agent_id, p_environment, 'submitted', p_confidence_score, p_requested_price
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;
