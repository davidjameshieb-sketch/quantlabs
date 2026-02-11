// Counterfactual Panel — Shows what would have happened if blocked trades were taken
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ShieldAlert, TrendingUp, TrendingDown, RefreshCw, Eye,
  CheckCircle2, XCircle, BarChart3, AlertTriangle,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CounterfactualOrder {
  id: string;
  currency_pair: string;
  direction: string;
  created_at: string;
  error_message: string | null;
  gate_result: string | null;
  counterfactual_entry_price: number | null;
  counterfactual_exit_5m: number | null;
  counterfactual_exit_10m: number | null;
  counterfactual_exit_15m: number | null;
  counterfactual_pips: number | null;
  counterfactual_result: string | null;
  governance_payload: Record<string, unknown> | null;
  session_label: string | null;
  regime_label: string | null;
}

interface CounterfactualStats {
  total: number;
  withPrice: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPips: number;
  totalMissedPips: number;
  byReason: Record<string, { total: number; wins: number; avgPips: number }>;
  byPair: Record<string, { total: number; wins: number; avgPips: number }>;
  pending: number;
}

function computeStats(orders: CounterfactualOrder[]): CounterfactualStats {
  const withPrice = orders.filter(o => o.counterfactual_entry_price != null);
  const resolved = withPrice.filter(o => o.counterfactual_result != null);
  const wins = resolved.filter(o => o.counterfactual_result === 'win');
  const losses = resolved.filter(o => o.counterfactual_result === 'loss');
  const pips = resolved.map(o => o.counterfactual_pips || 0);
  const avgPips = pips.length > 0 ? pips.reduce((a, b) => a + b, 0) / pips.length : 0;
  const totalMissedPips = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);

  const byReason: Record<string, { total: number; wins: number; totalPips: number }> = {};
  const byPair: Record<string, { total: number; wins: number; totalPips: number }> = {};

  for (const o of resolved) {
    // Extract top reason
    const payload = o.governance_payload as Record<string, unknown> | null;
    const edgeProof = payload?.edgeProof as Record<string, unknown> | null;
    const reasons = (edgeProof?.final_reason_top3 as string[]) || [];
    const topReason = reasons[0] || o.error_message?.split('|')[0]?.replace('EDGE LOCK: ', '').trim() || 'Unknown';

    // Categorize the reason
    let category = 'Other';
    if (topReason.includes('MTF')) category = 'MTF Consensus';
    else if (topReason.includes('Regime')) category = 'Regime';
    else if (topReason.includes('Coalition')) category = 'Coalition';
    else if (topReason.includes('Safety') || topReason.includes('spread') || topReason.includes('Friction')) category = 'Safety Gates';
    else if (topReason.includes('weak-consensus') || topReason.includes('Consensus')) category = 'Weak Signal';

    if (!byReason[category]) byReason[category] = { total: 0, wins: 0, totalPips: 0 };
    byReason[category].total++;
    if (o.counterfactual_result === 'win') byReason[category].wins++;
    byReason[category].totalPips += o.counterfactual_pips || 0;

    // By pair
    if (!byPair[o.currency_pair]) byPair[o.currency_pair] = { total: 0, wins: 0, totalPips: 0 };
    byPair[o.currency_pair].total++;
    if (o.counterfactual_result === 'win') byPair[o.currency_pair].wins++;
    byPair[o.currency_pair].totalPips += o.counterfactual_pips || 0;
  }

  const formatGroup = (g: { total: number; wins: number; totalPips: number }) => ({
    total: g.total,
    wins: g.wins,
    avgPips: g.total > 0 ? g.totalPips / g.total : 0,
  });

  return {
    total: orders.length,
    withPrice: withPrice.length,
    resolved: resolved.length,
    wins: wins.length,
    losses: losses.length,
    winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
    avgPips,
    totalMissedPips,
    byReason: Object.fromEntries(Object.entries(byReason).map(([k, v]) => [k, formatGroup(v)])),
    byPair: Object.fromEntries(Object.entries(byPair).map(([k, v]) => [k, formatGroup(v)])),
    pending: withPrice.length - resolved.length,
  };
}

export function CounterfactualPanel() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CounterfactualOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, created_at, error_message, gate_result, counterfactual_entry_price, counterfactual_exit_5m, counterfactual_exit_10m, counterfactual_exit_15m, counterfactual_pips, counterfactual_result, governance_payload, session_label, regime_label')
        .in('status', ['rejected', 'blocked', 'skipped'])
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setOrders((data || []) as CounterfactualOrder[]);
    } catch (err) {
      console.error('[Counterfactual] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = computeStats(orders);

  // Determine verdict
  let verdict: 'protecting' | 'over-filtering' | 'insufficient' = 'insufficient';
  let verdictColor = 'text-muted-foreground';
  let verdictIcon = <Eye className="w-4 h-4" />;

  if (stats.resolved >= 5) {
    if (stats.winRate < 0.45) {
      verdict = 'protecting';
      verdictColor = 'text-emerald-400';
      verdictIcon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    } else if (stats.winRate > 0.55 && stats.avgPips > 1.0) {
      verdict = 'over-filtering';
      verdictColor = 'text-amber-400';
      verdictIcon = <AlertTriangle className="w-4 h-4 text-amber-400" />;
    } else {
      verdict = 'protecting';
      verdictColor = 'text-emerald-400';
      verdictIcon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    }
  }

  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Blocked Trade Counterfactuals</CardTitle>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
              7D
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setShowDetails(!showDetails)}>
              <BarChart3 className="w-3 h-3 mr-1" />
              {showDetails ? 'Hide' : 'Details'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Verdict Banner */}
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${
          verdict === 'protecting' ? 'bg-emerald-500/10 border-emerald-500/30' :
          verdict === 'over-filtering' ? 'bg-amber-500/10 border-amber-500/30' :
          'bg-muted/30 border-border/30'
        }`}>
          {verdictIcon}
          <span className={`text-xs font-medium ${verdictColor}`}>
            {verdict === 'protecting' && 'Governance is protecting capital — blocked trades would have lost'}
            {verdict === 'over-filtering' && `⚠ Governance may be over-filtering — ${stats.wins} of ${stats.resolved} blocked trades would have been profitable (+${stats.totalMissedPips.toFixed(1)}p missed)`}
            {verdict === 'insufficient' && `Collecting data — ${stats.pending} blocked trades pending outcome (need 5+ resolved)`}
          </span>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-muted/20 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Blocked</div>
            <div className="text-lg font-bold">{stats.total}</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Tracked</div>
            <div className="text-lg font-bold">{stats.withPrice}</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">CF Win Rate</div>
            <div className={`text-lg font-bold ${stats.winRate > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stats.resolved > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '—'}
            </div>
          </div>
          <div className="bg-muted/20 rounded-lg p-2 text-center">
            <div className="text-[10px] text-muted-foreground">Avg CF Pips</div>
            <div className={`text-lg font-bold ${stats.avgPips > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stats.resolved > 0 ? `${stats.avgPips >= 0 ? '+' : ''}${stats.avgPips.toFixed(1)}` : '—'}
            </div>
          </div>
        </div>

        {/* Detailed Breakdowns */}
        {showDetails && stats.resolved > 0 && (
          <div className="space-y-3">
            {/* By Rejection Reason */}
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">By Rejection Reason</div>
              <div className="space-y-1">
                {Object.entries(stats.byReason)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([reason, data]) => {
                    const wr = data.total > 0 ? data.wins / data.total : 0;
                    return (
                      <TooltipProvider key={reason}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-between p-1.5 rounded bg-muted/15 hover:bg-muted/25 cursor-help">
                              <span className="text-[10px] font-medium">{reason}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-muted-foreground">{data.total} trades</span>
                                <span className={`text-[10px] font-bold ${wr > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {(wr * 100).toFixed(0)}% WR
                                </span>
                                <span className={`text-[10px] ${data.avgPips > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {data.avgPips >= 0 ? '+' : ''}{data.avgPips.toFixed(1)}p
                                </span>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {wr > 0.5
                                ? `⚠ ${reason} blocks might be too aggressive — ${data.wins}/${data.total} would have won`
                                : `✓ ${reason} is correctly filtering losers — only ${data.wins}/${data.total} would have won`}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
              </div>
            </div>

            {/* By Pair */}
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">By Currency Pair</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(stats.byPair)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([pair, data]) => {
                    const wr = data.total > 0 ? data.wins / data.total : 0;
                    return (
                      <div key={pair} className="flex items-center justify-between p-1.5 rounded bg-muted/15">
                        <span className="text-[10px] font-medium">{pair.replace('_', '/')}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold ${wr > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {(wr * 100).toFixed(0)}%
                          </span>
                          <span className={`text-[9px] ${data.avgPips > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {data.avgPips >= 0 ? '+' : ''}{data.avgPips.toFixed(1)}p
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Recent Blocked Trades */}
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5">Recent Blocked Trades</div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {orders
                  .filter(o => o.counterfactual_entry_price != null)
                  .slice(0, 15)
                  .map(o => (
                    <div key={o.id} className="flex items-center justify-between p-1 rounded bg-muted/10 text-[9px]">
                      <div className="flex items-center gap-1.5">
                        {o.direction === 'long'
                          ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                          : <TrendingDown className="w-3 h-3 text-red-400" />}
                        <span className="font-medium">{o.currency_pair.replace('_', '/')}</span>
                        <span className="text-muted-foreground">
                          {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {o.counterfactual_result ? (
                          <>
                            {o.counterfactual_result === 'win'
                              ? <Badge variant="outline" className="text-[8px] px-1 py-0 text-amber-400 border-amber-400/30">WOULD WIN</Badge>
                              : <Badge variant="outline" className="text-[8px] px-1 py-0 text-emerald-400 border-emerald-400/30">CORRECT BLOCK</Badge>}
                            <span className={`font-mono ${(o.counterfactual_pips || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {(o.counterfactual_pips || 0) >= 0 ? '+' : ''}{(o.counterfactual_pips || 0).toFixed(1)}p
                            </span>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 text-muted-foreground border-border/30">PENDING</Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Interpretation Guide */}
        <div className="text-[9px] text-muted-foreground/60 border-t border-border/20 pt-2">
          <span className="text-emerald-400/60">● Low CF win rate</span> = governance correctly filtering losers · 
          <span className="text-amber-400/60"> ● High CF win rate</span> = governance may be too restrictive
        </div>
      </CardContent>
    </Card>
  );
}
