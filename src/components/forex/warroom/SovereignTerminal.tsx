// Sovereign Terminal — Live Logic Tree, DNA Mutation Log, Shadow Barrage Monitor, OrderBook Heatmap, Synthetic Baskets
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TreePine, Dna, Ghost, Shield, Zap, Clock,
  ChevronRight, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, XCircle, FlaskConical, Target, Flame, Layers,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useFloorManagerState, type GateBypasses } from '@/hooks/useFloorManagerState';
import { useSovereignMemory, type SovereignMemoryEntry } from '@/hooks/useSovereignMemory';
import { useShadowOrders, type ShadowAgentStats } from '@/hooks/useShadowOrders';
import { OrderBookHeatmap } from './OrderBookHeatmap';
import { SyntheticPairsPanel } from './SyntheticPairsPanel';
import { ShadowAutoPromoter } from './ShadowAutoPromoter';

// ─── Shared Panel Wrapper ───
const TPanel = ({ title, icon: Icon, count, children }: {
  title: string; icon: React.ElementType; count?: number; children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden h-full"
  >
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      {count !== undefined && (
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 font-mono">{count}</Badge>
      )}
    </div>
    <div className="p-3">{children}</div>
  </motion.div>
);

const Empty = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="text-center py-8 text-muted-foreground text-xs">
    <Icon className="w-8 h-8 mx-auto mb-2 opacity-20" />
    {label}
  </div>
);

function timeAgo(ts: string) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// ─── LIVE LOGIC TREE ───
function LiveLogicTree() {
  const state = useFloorManagerState(10_000);
  const { entries: hardwiredRules, loading: memLoading } = useSovereignMemory(['HARDWIRED_RULE'], 10_000);

  // Combine gate_bypasses rules + sovereign_memory hardwired rules
  const allRules = useMemo(() => {
    const rules: {
      id: string; name: string; type: string; status: 'active' | 'expired';
      reason: string; pair: string | null; createdAt: string; expiresAt: string;
    }[] = [];

    // From gate_bypasses: HARDWIRED_RULE, DYNAMIC_GATE, GATE_THRESHOLD
    const gateEntries = [
      ...state.dynamicGates.map(g => ({ ...g, _ruleType: 'Dynamic Gate' })),
      ...state.gateThresholds.map(g => ({ ...g, _ruleType: 'Gate Threshold' })),
      ...state.bypasses.filter(b => b.gate_id.startsWith('HARDWIRED_RULE')).map(g => ({ ...g, _ruleType: 'Hardwired Rule' })),
    ];

    // Also include bypasses that are actual bypass overrides
    const bypassOverrides = state.bypasses.filter(b => !b.gate_id.startsWith('HARDWIRED_RULE'));

    for (const g of gateEntries) {
      const name = g.gate_id.includes(':') ? g.gate_id.split(':').slice(1).join(':') : g.gate_id;
      rules.push({
        id: g.id,
        name,
        type: g._ruleType,
        status: new Date(g.expires_at) > new Date() ? 'active' : 'expired',
        reason: g.reason,
        pair: g.pair,
        createdAt: g.created_at,
        expiresAt: g.expires_at,
      });
    }

    for (const b of bypassOverrides) {
      const name = b.gate_id.includes(':') ? b.gate_id.split(':').slice(1).join(':') : b.gate_id;
      rules.push({
        id: b.id,
        name,
        type: 'Bypass Override',
        status: 'active',
        reason: b.reason,
        pair: b.pair,
        createdAt: b.created_at,
        expiresAt: b.expires_at,
      });
    }

    // From sovereign_memory HARDWIRED_RULE entries
    for (const m of hardwiredRules) {
      const payload = m.payload as Record<string, unknown>;
      rules.push({
        id: m.id,
        name: (payload.ruleId as string) || m.memory_key,
        type: 'L0 Hardwired',
        status: 'active',
        reason: (payload.reason as string) || (payload.description as string) || '',
        pair: null,
        createdAt: m.created_at,
        expiresAt: m.expires_at || '',
      });
    }

    return rules.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state, hardwiredRules]);

  const typeColors: Record<string, string> = {
    'Hardwired Rule': 'bg-red-500/20 text-red-300',
    'L0 Hardwired': 'bg-red-500/20 text-red-300',
    'Dynamic Gate': 'bg-yellow-500/20 text-yellow-300',
    'Gate Threshold': 'bg-amber-500/20 text-amber-300',
    'Bypass Override': 'bg-emerald-500/20 text-emerald-300',
  };

  if (state.loading && memLoading) {
    return <Empty icon={TreePine} label="Loading logic tree…" />;
  }

  return (
    <TPanel title="Live Logic Tree" icon={TreePine} count={allRules.length}>
      {allRules.length === 0 ? (
        <Empty icon={Shield} label="No active rules or gates — system running on defaults" />
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-1.5 pr-2">
            {allRules.map((rule) => (
              <div key={rule.id} className="flex items-start gap-2 text-xs bg-muted/15 rounded-lg px-3 py-2 hover:bg-muted/25 transition-colors">
                <div className="mt-0.5 flex-shrink-0">
                  {rule.status === 'active' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-foreground text-[11px]">{rule.name}</span>
                    <Badge className={`text-[9px] h-4 px-1.5 font-mono border-0 ${typeColors[rule.type] || 'bg-muted text-muted-foreground'}`}>
                      {rule.type}
                    </Badge>
                    {rule.pair && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{rule.pair}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-2">{rule.reason}</p>
                </div>
                <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0">{timeAgo(rule.createdAt)}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </TPanel>
  );
}

// ─── DNA MUTATION LOG ───
function DnaMutationLog() {
  const { entries, loading } = useSovereignMemory(['dna_mutation'], 10_000, 50);
  const state = useFloorManagerState(10_000);

  // Merge: sovereign_memory dna_mutation + gate_bypasses AGENT_DNA_MUTATION
  const mutations = useMemo(() => {
    const all: {
      id: string; agent: string; mutation: string; before?: string; after?: string;
      reason: string; createdAt: string; source: 'memory' | 'gate';
    }[] = [];

    for (const e of entries) {
      const p = e.payload as Record<string, unknown>;
      all.push({
        id: e.id,
        agent: (p.agentId as string) || (p.agent_id as string) || e.memory_key,
        mutation: (p.mutation as string) || (p.change as string) || '',
        before: p.before as string | undefined,
        after: p.after as string | undefined,
        reason: (p.reason as string) || '',
        createdAt: e.updated_at || e.created_at,
        source: 'memory',
      });
    }

    for (const g of state.dnaMutations) {
      const label = g.gate_id.includes(':') ? g.gate_id.split(':').slice(1).join(':') : g.gate_id;
      all.push({
        id: g.id,
        agent: label,
        mutation: g.reason,
        reason: g.reason,
        createdAt: g.created_at,
        source: 'gate',
      });
    }

    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, state.dnaMutations]);

  if (loading && state.loading) {
    return <Empty icon={Dna} label="Loading DNA mutations…" />;
  }

  return (
    <TPanel title="DNA Mutation Log" icon={Dna} count={mutations.length}>
      {mutations.length === 0 ? (
        <Empty icon={FlaskConical} label="No DNA mutations recorded — agents running on base heuristics" />
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-2">
            {mutations.map((m) => (
              <div key={m.id} className="bg-muted/15 rounded-lg px-3 py-2 hover:bg-muted/25 transition-colors">
                <div className="flex items-center gap-2 text-[11px]">
                  <Dna className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="font-mono font-bold text-foreground">{m.agent}</span>
                  <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-purple-500/20 text-purple-300">
                    {m.source === 'memory' ? 'Persisted' : 'Active'}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground ml-auto">{timeAgo(m.createdAt)}</span>
                </div>
                {m.mutation && (
                  <p className="text-[10px] text-muted-foreground mt-1 pl-5 line-clamp-3">{m.mutation}</p>
                )}
                {(m.before || m.after) && (
                  <div className="mt-1.5 pl-5 font-mono text-[9px] space-y-0.5">
                    {m.before && (
                      <div className="flex gap-1">
                        <span className="text-red-400">−</span>
                        <span className="text-red-400/70 line-clamp-1">{m.before}</span>
                      </div>
                    )}
                    {m.after && (
                      <div className="flex gap-1">
                        <span className="text-emerald-400">+</span>
                        <span className="text-emerald-400/70 line-clamp-1">{m.after}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </TPanel>
  );
}

// ─── SHADOW BARRAGE MONITOR ───
function ShadowBarrageMonitor() {
  const { orders, stats, loading } = useShadowOrders(10_000);

  if (loading) {
    return <Empty icon={Ghost} label="Loading shadow agents…" />;
  }

  return (
    <TPanel title="Shadow Barrage Monitor" icon={Ghost} count={orders.length}>
      {stats.length === 0 && orders.length === 0 ? (
        <Empty icon={Target} label="No shadow agents deployed yet — FM can synthesize via synthesize_shadow_agent" />
      ) : (
        <div className="space-y-4">
          {/* Agent scoreboard */}
          {stats.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Agent Scoreboard</span>
              <div className="space-y-1">
                {stats.map((s) => {
                  const promotable = s.winRate > 55 && s.avgR > 1.2 && s.totalTrades >= 20;
                  return (
                    <div key={s.agentId} className="flex items-center gap-2 text-[11px] bg-muted/15 rounded-lg px-3 py-2">
                      <Ghost className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="font-mono font-bold text-foreground truncate flex-1">{s.agentId}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{s.totalTrades} trades</span>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 font-mono ${s.winRate >= 55 ? 'border-emerald-500/30 text-emerald-400' : 'border-muted-foreground/30'}`}>
                        {s.winRate.toFixed(0)}% WR
                      </Badge>
                      <span className={`font-mono text-[10px] ${s.netPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.netPips >= 0 ? '+' : ''}{s.netPips}p
                      </span>
                      {promotable && (
                        <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-amber-500/20 text-amber-300 animate-pulse">
                          PROMOTE ↑
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent trades */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Recent Shadow Trades</span>
            <ScrollArea className="h-[250px]">
              <div className="space-y-1 pr-2">
                {orders.slice(0, 50).map((o) => {
                  const isWin = o.entry_price && o.exit_price && (
                    o.direction === 'long' ? o.exit_price > o.entry_price : o.entry_price > o.exit_price
                  );
                  const isClosed = o.status === 'filled' || o.status === 'closed';
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-[11px] bg-muted/10 rounded-md px-2.5 py-1.5">
                      {o.direction === 'long' ? (
                        <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                      )}
                      <span className="font-mono text-foreground text-[10px]">{o.currency_pair}</span>
                      <span className="font-mono text-muted-foreground text-[9px]">{o.agent_id?.replace('shadow-', 'S:')}</span>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 font-mono ml-auto ${
                        isClosed ? (isWin ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400') : 'border-blue-500/30 text-blue-400'
                      }`}>
                        {isClosed ? (isWin ? 'WIN' : 'LOSS') : o.status}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">{timeAgo(o.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </TPanel>
  );
}

// ─── MAIN EXPORT ───
export function SovereignTerminal() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="logic-tree" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1 flex-wrap">
          <TabsTrigger value="logic-tree" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TreePine className="w-3.5 h-3.5" />Live Logic Tree
          </TabsTrigger>
          <TabsTrigger value="dna-log" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Dna className="w-3.5 h-3.5" />DNA Mutations
          </TabsTrigger>
          <TabsTrigger value="shadow" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ghost className="w-3.5 h-3.5" />Shadow Barrage
          </TabsTrigger>
          <TabsTrigger value="orderbook" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Flame className="w-3.5 h-3.5" />OrderBook Heatmap
          </TabsTrigger>
          <TabsTrigger value="synthetic" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Layers className="w-3.5 h-3.5" />Synthetic Baskets
          </TabsTrigger>
          <TabsTrigger value="auto-promote" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="w-3.5 h-3.5" />Auto-Promoter
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logic-tree">
          <LiveLogicTree />
        </TabsContent>
        <TabsContent value="dna-log">
          <DnaMutationLog />
        </TabsContent>
        <TabsContent value="shadow">
          <ShadowBarrageMonitor />
        </TabsContent>
        <TabsContent value="orderbook">
          <OrderBookHeatmap />
        </TabsContent>
        <TabsContent value="synthetic">
          <SyntheticPairsPanel />
        </TabsContent>
        <TabsContent value="auto-promote">
          <ShadowAutoPromoter />
        </TabsContent>
      </Tabs>
    </div>
  );
}
