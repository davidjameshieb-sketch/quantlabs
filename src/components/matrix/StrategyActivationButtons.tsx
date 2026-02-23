// Strategy Activation Buttons — Bring backtested strategies to live OANDA trading
// Provides "Bring to Live Trading" and "Verify Strategy is Trading Live" buttons

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StrategyConfig {
  strategyId: string;       // Unique identifier for the strategy
  strategyName: string;     // Display name
  engineSource: string;     // Which engine discovered it: profile-discovery, experimental-lab, sandbox, live-backtest, alpha-discovery
  // Profile-based strategies
  predator?: number;
  prey?: number;
  gates?: string;
  slPips?: number;
  tpRatio?: number | string;
  session?: string;
  // Alpha discovery strategies
  pair?: string;
  dna?: Record<string, unknown>;
  entryRules?: string[];
  exitRules?: string[];
  // Performance metrics from backtest
  winRate?: number;
  profitFactor?: number;
  maxDrawdown?: number;
  trades?: number;
  totalPips?: number;
  institutionalPF?: number;
  expectancy?: number;
}

interface VerificationResult {
  isActive: boolean;
  recentTrades: number;
  lastTradeAge?: string;
  matchingConfig: boolean;
  oandaConnected: boolean;
  errors: string[];
  warnings: string[];
}

export function StrategyActivationButtons({ strategy }: { strategy: StrategyConfig }) {
  const [activating, setActivating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activated, setActivated] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [showVerification, setShowVerification] = useState(false);

  const activateStrategy = useCallback(async () => {
    setActivating(true);
    try {
      const agentId = `${strategy.engineSource}-${strategy.strategyId}`;

      const config = {
        strategyName: strategy.strategyName,
        engineSource: strategy.engineSource,
        predator: strategy.predator,
        prey: strategy.prey,
        gates: strategy.gates,
        slPips: strategy.slPips,
        tpRatio: strategy.tpRatio,
        session: strategy.session,
        pair: strategy.pair,
        dna: strategy.dna,
        entryRules: strategy.entryRules,
        exitRules: strategy.exitRules,
        // Backtest performance snapshot
        backtestMetrics: {
          winRate: strategy.winRate,
          profitFactor: strategy.profitFactor,
          institutionalPF: strategy.institutionalPF,
          maxDrawdown: strategy.maxDrawdown,
          trades: strategy.trades,
          totalPips: strategy.totalPips,
          expectancy: strategy.expectancy,
        },
        activatedAt: new Date().toISOString(),
        autoExecute: true,
      };

      // Upsert into agent_configs
      const { error } = await supabase
        .from('agent_configs')
        .upsert(
          { agent_id: agentId, config: config as any, is_active: true },
          { onConflict: 'agent_id' }
        );

      if (error) throw error;

      setActivated(true);
      toast.success(`Strategy "${strategy.strategyName}" activated for live trading`);
    } catch (err) {
      toast.error(`Activation failed: ${(err as Error).message}`);
    } finally {
      setActivating(false);
    }
  }, [strategy]);

  const verifyStrategy = useCallback(async () => {
    setVerifying(true);
    setShowVerification(true);
    try {
      const agentId = `${strategy.engineSource}-${strategy.strategyId}`;
      const errors: string[] = [];
      const warnings: string[] = [];

      // 1. Check agent_configs for active config
      const { data: configData } = await supabase
        .from('agent_configs')
        .select('agent_id, config, is_active')
        .eq('agent_id', agentId)
        .single();

      const matchingConfig = !!configData?.is_active;
      if (!matchingConfig) errors.push('Strategy not found in active agent configs');

      // 2. Check OANDA connection
      let oandaConnected = false;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ action: 'account-summary', environment: 'practice' }),
          }
        );
        const data = await res.json();
        oandaConnected = data.success === true;
        if (!oandaConnected) errors.push('OANDA broker connection failed');
      } catch {
        errors.push('Cannot reach OANDA execution endpoint');
      }

      // 3. Check recent trades from this agent
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentOrders } = await supabase
        .from('oanda_orders')
        .select('id, created_at, status, currency_pair, direction')
        .eq('agent_id', agentId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      const recentTrades = recentOrders?.length || 0;
      let lastTradeAge: string | undefined;

      if (recentOrders && recentOrders.length > 0) {
        const lastTrade = recentOrders[0];
        const ageMs = Date.now() - new Date(lastTrade.created_at).getTime();
        const ageHours = Math.round(ageMs / (1000 * 60 * 60));
        lastTradeAge = ageHours < 1 ? '<1h ago' : ageHours < 24 ? `${ageHours}h ago` : `${Math.round(ageHours / 24)}d ago`;

        // Check for rejected trades
        const rejectedCount = recentOrders.filter(o => o.status === 'rejected').length;
        if (rejectedCount > 0) warnings.push(`${rejectedCount} rejected trades in last 7 days`);
      } else if (matchingConfig) {
        warnings.push('Config is active but no trades placed in last 7 days');
      }

      // 4. Check gate bypasses / circuit breakers
      const { data: breakers } = await supabase
        .from('gate_bypasses')
        .select('gate_id, reason, expires_at')
        .like('gate_id', 'CIRCUIT_BREAKER:%')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString())
        .limit(5);

      if (breakers && breakers.length > 0) {
        warnings.push(`Circuit breaker active: ${breakers[0].reason}`);
      }

      const isActive = matchingConfig && oandaConnected && errors.length === 0;

      setVerification({ isActive, recentTrades, lastTradeAge, matchingConfig, oandaConnected, errors, warnings });
    } catch (err) {
      setVerification({
        isActive: false, recentTrades: 0, matchingConfig: false, oandaConnected: false,
        errors: [`Verification failed: ${(err as Error).message}`], warnings: [],
      });
    } finally {
      setVerifying(false);
    }
  }, [strategy]);

  return (
    <div className="mt-3 space-y-2">
      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={activateStrategy}
          disabled={activating || activated}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-50"
          style={{
            background: activated ? 'rgba(57, 255, 20, 0.15)' : 'linear-gradient(135deg, #ff660020, #ff440010)',
            border: `1px solid ${activated ? '#39ff1455' : '#ff660055'}`,
            color: activated ? '#39ff14' : '#ff6600',
          }}
        >
          {activating ? <Loader2 className="w-3 h-3 animate-spin" /> : activated ? <CheckCircle2 className="w-3 h-3" /> : <Rocket className="w-3 h-3" />}
          {activating ? 'Activating...' : activated ? 'Activated ✓' : 'Bring to Live Trading'}
        </button>

        <button
          onClick={verifyStrategy}
          disabled={verifying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #00ffea10, #0f172a)',
            border: '1px solid #00ffea44',
            color: '#00ffea',
          }}
        >
          {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
          {verifying ? 'Verifying...' : 'Verify Strategy is Trading Live'}
        </button>
      </div>

      {/* Verification Results */}
      <AnimatePresence>
        {showVerification && verification && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-lg p-3 space-y-2"
              style={{
                background: verification.isActive ? 'rgba(57, 255, 20, 0.05)' : 'rgba(255, 0, 85, 0.05)',
                border: `1px solid ${verification.isActive ? '#39ff1433' : '#ff005533'}`,
              }}
            >
              {/* Status Header */}
              <div className="flex items-center gap-2">
                {verification.isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-[#39ff14]" />
                ) : (
                  <XCircle className="w-4 h-4 text-[#ff0055]" />
                )}
                <span
                  className="text-[10px] font-mono font-bold uppercase tracking-widest"
                  style={{ color: verification.isActive ? '#39ff14' : '#ff0055' }}
                >
                  {verification.isActive ? '✅ STRATEGY IS LIVE & ACTIVE' : '❌ STRATEGY NOT TRADING'}
                </span>
                <button
                  onClick={() => setShowVerification(false)}
                  className="ml-auto text-[8px] font-mono text-slate-500 hover:text-slate-300"
                >
                  ✕ Close
                </button>
              </div>

              {/* Check Results */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    label: 'Agent Config',
                    ok: verification.matchingConfig,
                    value: verification.matchingConfig ? 'Active' : 'Missing',
                  },
                  {
                    label: 'OANDA Broker',
                    ok: verification.oandaConnected,
                    value: verification.oandaConnected ? 'Connected' : 'Offline',
                  },
                  {
                    label: 'Recent Trades',
                    ok: verification.recentTrades > 0,
                    value: verification.recentTrades > 0 ? `${verification.recentTrades} trades` : 'None',
                  },
                  {
                    label: 'Last Trade',
                    ok: !!verification.lastTradeAge,
                    value: verification.lastTradeAge || 'N/A',
                  },
                ].map((check) => (
                  <div
                    key={check.label}
                    className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center"
                  >
                    <div className="text-[7px] text-slate-500 uppercase tracking-wider">{check.label}</div>
                    <div
                      className="text-[10px] font-bold font-mono"
                      style={{ color: check.ok ? '#39ff14' : '#ff0055' }}
                    >
                      {check.ok ? '✓' : '✗'} {check.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Errors */}
              {verification.errors.length > 0 && (
                <div className="space-y-1">
                  {verification.errors.map((err, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff0055]">
                      <XCircle className="w-3 h-3 flex-shrink-0" />
                      {err}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {verification.warnings.length > 0 && (
                <div className="space-y-1">
                  {verification.warnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono text-[#ff8800]">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
