// Kill-Switch HUD — P0 Foundation: circuit breakers, suspensions, blacklists, risk gates
import { motion } from 'framer-motion';
import { ShieldAlert, Ban, Pause, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type FloorManagerState } from '@/hooks/useFloorManagerState';

interface Props { state: FloorManagerState; }

function timeAgo(ts: string) {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function KillSwitchHUD({ state }: Props) {
  const cbActive = !!state.circuitBreaker;
  const totalKills = (state.circuitBreaker ? 1 : 0) + state.suspendedAgents.length + state.blacklists.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden h-full"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <ShieldAlert className="w-4 h-4 text-red-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">Kill-Switch HUD</span>
        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">P0</Badge>
        {totalKills > 0 && (
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-red-500/20 text-red-300 animate-pulse">
            {totalKills} ACTIVE
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-3">
        {/* Circuit Breaker Status */}
        <div className={`rounded-lg px-3 py-2.5 border ${cbActive ? 'border-red-500/40 bg-red-500/10' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
          <div className="flex items-center gap-2">
            {cbActive ? (
              <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            )}
            <span className="text-xs font-bold text-foreground">Circuit Breaker</span>
            <Badge className={`text-[9px] h-4 px-1.5 font-mono border-0 ml-auto ${cbActive ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              {cbActive ? 'TRIPPED' : 'CLEAR'}
            </Badge>
          </div>
          {cbActive && state.circuitBreaker && (
            <p className="text-[10px] text-red-300/80 mt-1 line-clamp-2">{state.circuitBreaker.reason}</p>
          )}
        </div>

        {/* Suspended Agents */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Pause className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Suspended Agents</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">{state.suspendedAgents.length}</Badge>
          </div>
          {state.suspendedAgents.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">All agents operational</span>
          ) : (
            <ScrollArea className="max-h-[120px]">
              <div className="space-y-1">
                {state.suspendedAgents.map(a => {
                  const label = a.gate_id.split(':').slice(1).join(':') || a.gate_id;
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-[10px] bg-amber-500/10 rounded px-2 py-1">
                      <Ban className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="font-mono text-foreground truncate">{label}</span>
                      <span className="text-muted-foreground ml-auto">{timeAgo(a.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Blacklists */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Ban className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Session Blacklists</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono ml-auto">{state.blacklists.length}</Badge>
          </div>
          {state.blacklists.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">No active blacklists</span>
          ) : (
            <ScrollArea className="max-h-[100px]">
              <div className="space-y-1">
                {state.blacklists.map(b => (
                  <div key={b.id} className="flex items-center gap-2 text-[10px] bg-orange-500/10 rounded px-2 py-1">
                    <span className="font-mono text-foreground truncate">{b.pair || 'GLOBAL'}</span>
                    <span className="text-muted-foreground truncate flex-1">{b.reason}</span>
                    <span className="text-muted-foreground">{timeAgo(b.created_at)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </motion.div>
  );
}
