// Evolution Timeline — chronological view of directive synthesis, mutation, and retirement
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Dna, Sparkles, Trash2, Zap, Clock, Plus, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface EvolutionEvent {
  id: string;
  type: 'synthesis' | 'mutation' | 'retirement' | 'weight_tune' | 'shadow_spawn';
  label: string;
  detail: string;
  pair: string | null;
  timestamp: string;
  source: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  synthesis: { icon: Plus, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  mutation: { icon: Dna, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  retirement: { icon: Trash2, color: 'text-red-400', bg: 'bg-red-500/20' },
  weight_tune: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  shadow_spawn: { icon: Sparkles, color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
};

function classifyEvent(gateId: string): EvolutionEvent['type'] {
  const id = gateId.toLowerCase();
  if (id.includes('dna_mutation') || id.includes('agent_dna')) return 'mutation';
  if (id.includes('shadow_agent')) return 'shadow_spawn';
  if (id.includes('indicator_weight')) return 'weight_tune';
  if (id.includes('retire') || id.includes('prune') || id.includes('suspend')) return 'retirement';
  return 'synthesis';
}

export function EvolutionTimeline() {
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fetch evolution-related gate_bypasses
      const { data } = await supabase
        .from('gate_bypasses')
        .select('id,gate_id,reason,pair,created_at,created_by')
        .or('gate_id.like.AGENT_DNA_MUTATION:%,gate_id.like.SHADOW_AGENT:%,gate_id.like.INDICATOR_WEIGHT:%,gate_id.like.EVOLUTION_PARAM:%,gate_id.like.PHYSICS_GATE:%,gate_id.like.DYNAMIC_GATE:%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data) return;

      setEvents(data.map(d => {
        const type = classifyEvent(d.gate_id);
        const label = d.gate_id.includes(':') ? d.gate_id.split(':').slice(1).join(':') : d.gate_id;
        return {
          id: d.id,
          type,
          label: label.slice(0, 50),
          detail: d.reason || '',
          pair: d.pair,
          timestamp: d.created_at,
          source: d.created_by || 'sovereign-loop',
        };
      }));
    } catch (e) {
      console.warn('[EvolutionTimeline] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Group by day
  const grouped = events.reduce<Record<string, EvolutionEvent[]>>((acc, e) => {
    const day = new Date(e.timestamp).toLocaleDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          <GitBranch className="w-5 h-5 mx-auto mb-2 animate-pulse opacity-40" />
          Loading evolution timeline…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Evolution Timeline
            <Badge variant="secondary" className="text-[10px] font-mono">
              {events.length} events
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2 text-[9px]">
            {Object.entries(EVENT_CONFIG).map(([type, cfg]) => {
              const count = events.filter(e => e.type === type).length;
              if (count === 0) return null;
              return (
                <Badge key={type} variant="outline" className={`text-[8px] ${cfg.bg} ${cfg.color} border-transparent`}>
                  {count} {type.replace('_', ' ')}
                </Badge>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Dna className="w-8 h-8 mx-auto mb-2 opacity-20" />
            No evolution events recorded — system will synthesize autonomously
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-4 pr-2">
              {Object.entries(grouped).map(([day, dayEvents]) => (
                <div key={day} className="space-y-1.5">
                  <div className="flex items-center gap-2 sticky top-0 bg-card/80 backdrop-blur-sm py-1 z-10">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold text-foreground">{day}</span>
                    <span className="text-[9px] text-muted-foreground">{dayEvents.length} events</span>
                  </div>
                  {dayEvents.map(e => {
                    const cfg = EVENT_CONFIG[e.type] || EVENT_CONFIG.synthesis;
                    const Icon = cfg.icon;
                    const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div key={e.id} className="flex items-start gap-2 pl-2">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-5 h-5 rounded-full ${cfg.bg} flex items-center justify-center`}>
                            <Icon className={`w-2.5 h-2.5 ${cfg.color}`} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 bg-muted/15 rounded-lg px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-foreground truncate">{e.label}</span>
                            {e.pair && (
                              <Badge variant="outline" className="text-[8px] h-4 px-1 font-mono">{e.pair}</Badge>
                            )}
                            <span className="text-[9px] text-muted-foreground ml-auto flex-shrink-0">{time}</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{e.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
