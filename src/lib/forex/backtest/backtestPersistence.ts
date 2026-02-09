// Backtest Persistence Layer
// Stores backtest trade records into the oanda_orders table
// with environment='backtest' and status='closed'.

import type { BacktestTradeRecord } from './backtestRunner';
import { supabase } from '@/integrations/supabase/client';

const BACKTEST_USER_ID = '11edc350-4c81-4d9f-82ae-cd2209b7581d';

export interface PersistenceResult {
  inserted: number;
  errors: number;
  errorMessages: string[];
}

export async function persistBacktestTrades(
  trades: BacktestTradeRecord[],
): Promise<PersistenceResult> {
  let inserted = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  // Batch insert in chunks of 50
  const chunkSize = 50;
  for (let i = 0; i < trades.length; i += chunkSize) {
    const chunk = trades.slice(i, i + chunkSize);

    const rows = chunk.map(t => ({
      user_id: BACKTEST_USER_ID,
      signal_id: t.signal_id,
      currency_pair: t.currency_pair,
      direction: t.direction,
      units: t.units,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      status: 'closed' as const,
      environment: 'backtest',
      variant_id: t.variant_id,
      direction_engine: t.direction_engine,
      quantlabs_bias: t.quantlabs_bias,
      quantlabs_confidence: t.quantlabs_confidence,
      direction_tf_used: t.direction_tf_used,
      confirmation_tf_used: t.confirmation_tf_used,
      governance_composite: t.governance_composite,
      session_label: t.session_label,
      regime_label: t.regime_label,
      spread_at_entry: t.spread_at_entry,
      slippage_pips: t.slippage_pips,
      friction_score: t.friction_score,
      execution_quality_score: t.execution_quality_score,
      gate_result: t.governance_decision,
      gate_reasons: t.gates_triggered.length > 0 ? t.gates_triggered : null,
      confidence_score: t.quantlabs_confidence ? Math.round(t.quantlabs_confidence * 100) : null,
      agent_id: 'backtest-engine',
      created_at: new Date(t.entry_timestamp).toISOString(),
      closed_at: new Date(t.exit_timestamp).toISOString(),
      governance_payload: {
        mfe_pips: t.mfe_pips,
        mae_pips: t.mae_pips,
        capture_ratio: t.capture_ratio,
        pnl_pips: t.pnl_pips,
        duration_minutes: t.duration_minutes,
        total_friction_pips: t.spread_at_entry + t.slippage_pips,
      },
    }));

    const { error } = await supabase
      .from('oanda_orders')
      .insert(rows as any);

    if (error) {
      errors += chunk.length;
      errorMessages.push(error.message);
      console.error('[BacktestPersistence] Chunk insert error:', error.message);
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`[BacktestPersistence] Persisted ${inserted}/${trades.length} trades (${errors} errors)`);
  return { inserted, errors, errorMessages };
}

export async function clearBacktestTrades(variantId?: string): Promise<number> {
  let query = supabase
    .from('oanda_orders')
    .delete()
    .eq('environment', 'backtest');

  if (variantId) {
    query = query.eq('variant_id', variantId);
  }

  const { error, count } = await query;

  if (error) {
    console.error('[BacktestPersistence] Clear error:', error.message);
    return 0;
  }

  return count ?? 0;
}
