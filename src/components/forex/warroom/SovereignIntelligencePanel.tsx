// Sovereign Intelligence Panel — Full visibility into the AI Floor Manager's autonomous decisions
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Dna, Brain, Ghost, Ban, FlaskConical, Gauge,
  ShieldAlert, Sparkles, Clock, Zap,
} from 'lucide-react';
import { useFloorManagerState, type GateBypasses } from '@/hooks/useFloorManagerState';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

// ─── Panel wrapper ───
const IPanel = ({ title, icon: Icon, count, children }: {
  title: string; icon: React.ElementType; count?: number; children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden"
  >
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      {count !== undefined && (
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 font-mono">
          {count}
        </Badge>
      )}
    </div>
    <div className="p-3">{children}</div>
  </motion.div>
);

// ─── Entry row ───
const EntryRow = ({ entry, icon: Icon, accent = 'text-primary' }: {
  entry: GateBypasses; icon: React.ElementType; accent?: string;
}) => {
  const label = entry.gate_id.includes(':') ? entry.gate_id.split(':').slice(1).join(':') : entry.gate_id;
  const age = Math.round((Date.now() - new Date(entry.created_at).getTime()) / 60_000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;

  return (
    <div className="flex items-start gap-2 text-xs bg-muted/20 rounded-lg px-3 py-2">
      <Icon className={`w-3.5 h-3.5 ${accent} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-foreground truncate">{label}</span>
          {entry.pair && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{entry.pair}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-2">{entry.reason}</p>
      </div>
      <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0">{ageStr}</span>
    </div>
  );
};

// ─── Empty state ───
const Empty = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="text-center py-4 text-muted-foreground text-xs">
    <Icon className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
    {label}
  </div>
);

export function SovereignIntelligencePanel() {
  const state = useFloorManagerState(10_000);

  // ─── Sovereign Activity Feed: merge all categories, sort by created_at ───
  const activityFeed = useMemo(() => {
    const all = [
      ...state.dnaMutations.map(e => ({ ...e, _type: 'DNA Mutation' as const })),
      ...state.indicatorWeights.map(e => ({ ...e, _type: 'Weight Tune' as const })),
      ...state.shadowAgents.map(e => ({ ...e, _type: 'Shadow Agent' as const })),
      ...state.suspendedAgents.map(e => ({ ...e, _type: 'Suspension' as const })),
      ...state.blacklists.map(e => ({ ...e, _type: 'Blacklist' as const })),
      ...state.gateThresholds.map(e => ({ ...e, _type: 'Gate Tune' as const })),
      ...state.evolutionParams.map(e => ({ ...e, _type: 'Evolution' as const })),
      ...state.dynamicGates.map(e => ({ ...e, _type: 'Dynamic Gate' as const })),
      ...state.bypasses.map(e => ({ ...e, _type: 'Bypass' as const })),
    ];
    return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
  }, [state]);

  const typeColor: Record<string, string> = {
    'DNA Mutation': 'bg-purple-500/20 text-purple-300',
    'Weight Tune': 'bg-blue-500/20 text-blue-300',
    'Shadow Agent': 'bg-cyan-500/20 text-cyan-300',
    'Suspension': 'bg-red-500/20 text-red-300',
    'Blacklist': 'bg-orange-500/20 text-orange-300',
    'Gate Tune': 'bg-amber-500/20 text-amber-300',
    'Evolution': 'bg-emerald-500/20 text-emerald-300',
    'Dynamic Gate': 'bg-yellow-500/20 text-yellow-300',
    'Bypass': 'bg-muted text-muted-foreground',
  };

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Brain className="w-5 h-5 mr-2 animate-pulse" /> Loading sovereign intelligence…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── SOVEREIGN ACTIVITY FEED ─── */}
      <IPanel title="Sovereign Activity Feed" icon={Zap} count={activityFeed.length}>
        {activityFeed.length === 0 ? (
          <Empty icon={Clock} label="No autonomous actions recorded yet" />
        ) : (
          <ScrollArea className="h-[260px]">
            <div className="space-y-1.5 pr-2">
              {activityFeed.map((e, i) => {
                const age = Math.round((Date.now() - new Date(e.created_at).getTime()) / 60_000);
                const ageStr = age < 60 ? `${age}m` : `${Math.round(age / 60)}h`;
                const label = e.gate_id.includes(':') ? e.gate_id.split(':').slice(1).join(':') : e.gate_id;
                return (
                  <div key={e.id || i} className="flex items-center gap-2 text-[11px] py-1.5 px-2 rounded-md bg-muted/15 hover:bg-muted/30 transition-colors">
                    <Badge className={`text-[9px] h-4 px-1.5 font-mono border-0 ${typeColor[e._type] || ''}`}>
                      {e._type}
                    </Badge>
                    <span className="font-mono text-foreground font-medium truncate flex-1">{label}</span>
                    {e.pair && <span className="text-muted-foreground font-mono text-[9px]">{e.pair}</span>}
                    <span className="text-muted-foreground text-[9px] flex-shrink-0">{ageStr}</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </IPanel>

      {/* ─── 2-col: DNA Mutations + Indicator Weights ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IPanel title="Agent DNA Mutations" icon={Dna} count={state.dnaMutations.length}>
          {state.dnaMutations.length === 0 ? (
            <Empty icon={Dna} label="No active DNA mutations" />
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {state.dnaMutations.map((m, i) => (
                  <EntryRow key={m.id || i} entry={m} icon={Dna} accent="text-purple-400" />
                ))}
              </div>
            </ScrollArea>
          )}
        </IPanel>

        <IPanel title="Neural Indicator Weights" icon={Brain} count={state.indicatorWeights.length}>
          {state.indicatorWeights.length === 0 ? (
            <Empty icon={Brain} label="No weight overrides active" />
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {state.indicatorWeights.map((w, i) => (
                  <EntryRow key={w.id || i} entry={w} icon={Gauge} accent="text-blue-400" />
                ))}
              </div>
            </ScrollArea>
          )}
        </IPanel>
      </div>

      {/* ─── 2-col: Shadow Agents + Suspended Agents ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IPanel title="Shadow Agents (0.1x)" icon={Ghost} count={state.shadowAgents.length}>
          {state.shadowAgents.length === 0 ? (
            <Empty icon={Ghost} label="No shadow agents synthesized yet" />
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {state.shadowAgents.map((s, i) => (
                  <EntryRow key={s.id || i} entry={s} icon={Sparkles} accent="text-cyan-400" />
                ))}
              </div>
            </ScrollArea>
          )}
        </IPanel>

        <IPanel title="Suspended Agents" icon={Ban} count={state.suspendedAgents.length}>
          {state.suspendedAgents.length === 0 ? (
            <Empty icon={Ban} label="No agents currently suspended" />
          ) : (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1.5">
                {state.suspendedAgents.map((a, i) => (
                  <EntryRow key={a.id || i} entry={a} icon={ShieldAlert} accent="text-red-400" />
                ))}
              </div>
            </ScrollArea>
          )}
        </IPanel>
      </div>

      {/* ─── 3-col: Evolution Params + Gate Thresholds + Blacklists ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <IPanel title="Evolution Tuning" icon={FlaskConical} count={state.evolutionParams.length}>
          {state.evolutionParams.length === 0 ? (
            <Empty icon={FlaskConical} label="Default params" />
          ) : (
            <div className="space-y-1.5">
              {state.evolutionParams.slice(0, 6).map((e, i) => (
                <EntryRow key={e.id || i} entry={e} icon={FlaskConical} accent="text-emerald-400" />
              ))}
            </div>
          )}
        </IPanel>

        <IPanel title="Gate Thresholds" icon={Gauge} count={state.gateThresholds.length}>
          {state.gateThresholds.length === 0 ? (
            <Empty icon={Gauge} label="Default gates" />
          ) : (
            <div className="space-y-1.5">
              {state.gateThresholds.slice(0, 6).map((g, i) => (
                <EntryRow key={g.id || i} entry={g} icon={Gauge} accent="text-amber-400" />
              ))}
            </div>
          )}
        </IPanel>

        <IPanel title="Session Blacklists" icon={Ban} count={state.blacklists.length}>
          {state.blacklists.length === 0 ? (
            <Empty icon={Ban} label="No blacklists" />
          ) : (
            <div className="space-y-1.5">
              {state.blacklists.slice(0, 6).map((b, i) => (
                <EntryRow key={b.id || i} entry={b} icon={Ban} accent="text-orange-400" />
              ))}
            </div>
          )}
        </IPanel>
      </div>

      {/* ─── Circuit Breaker + Sizing Override ─── */}
      {(state.circuitBreaker || state.sizingOverride) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.circuitBreaker && (
            <IPanel title="⚡ Circuit Breaker ACTIVE" icon={ShieldAlert}>
              <EntryRow entry={state.circuitBreaker} icon={ShieldAlert} accent="text-red-500" />
            </IPanel>
          )}
          {state.sizingOverride && (
            <IPanel title="📐 Sizing Override" icon={Gauge}>
              <EntryRow entry={state.sizingOverride} icon={Gauge} accent="text-amber-400" />
            </IPanel>
          )}
        </div>
      )}
    </div>
  );
}
