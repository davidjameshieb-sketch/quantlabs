// Physics Gate Registry — all autonomously created PHYSICS_GATE rules with stats
import { useState, useEffect, useCallback } from 'react';
import { Atom, Zap, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface PhysicsGate {
  id: string;
  gateId: string;
  rule: string;
  pair: string | null;
  hitCount: number;
  lastFired: string | null;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

export function PhysicsGateRegistry() {
  const [gates, setGates] = useState<PhysicsGate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      // Fetch all PHYSICS_GATE and DYNAMIC_GATE entries
      const { data } = await supabase
        .from('gate_bypasses')
        .select('id,gate_id,reason,pair,created_at,expires_at,revoked')
        .or('gate_id.like.PHYSICS_GATE:%,gate_id.like.DYNAMIC_GATE:%')
        .eq('revoked', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!data) return;

      // Dedupe by gate_id and count hits
      const gateMap = new Map<string, PhysicsGate>();
      for (const d of data) {
        const existing = gateMap.get(d.gate_id);
        if (existing) {
          existing.hitCount++;
          if (d.created_at > (existing.lastFired || '')) existing.lastFired = d.created_at;
        } else {
          gateMap.set(d.gate_id, {
            id: d.id,
            gateId: d.gate_id,
            rule: d.reason || '',
            pair: d.pair,
            hitCount: 1,
            lastFired: d.created_at,
            createdAt: d.created_at,
            expiresAt: d.expires_at,
            active: new Date(d.expires_at) > new Date(),
          });
        }
      }

      setGates(Array.from(gateMap.values()).sort((a, b) => b.hitCount - a.hitCount));
    } catch (e) {
      console.warn('[PhysicsGateRegistry] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const activeCount = gates.filter(g => g.active).length;

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          <Atom className="w-5 h-5 mx-auto mb-2 animate-pulse opacity-40" />
          Loading physics gates…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Atom className="w-4 h-4 text-primary" />
            Physics Gate Registry
            <Badge variant="secondary" className="text-[10px] font-mono">
              {activeCount} active · {gates.length} total
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {gates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Atom className="w-8 h-8 mx-auto mb-2 opacity-20" />
            No physics gates synthesized yet — FM will create these autonomously
          </div>
        ) : (
          <ScrollArea className="h-[260px]">
            <div className="space-y-1.5 pr-2">
              {gates.map(g => {
                const label = g.gateId.replace('PHYSICS_GATE:', '').replace('DYNAMIC_GATE:', '');
                const ageMs = Date.now() - new Date(g.createdAt).getTime();
                const ageStr = ageMs < 3600_000 ? `${Math.round(ageMs / 60_000)}m` : `${Math.round(ageMs / 3600_000)}h`;
                const lastFireAge = g.lastFired
                  ? Date.now() - new Date(g.lastFired).getTime() < 3600_000
                    ? `${Math.round((Date.now() - new Date(g.lastFired).getTime()) / 60_000)}m ago`
                    : `${Math.round((Date.now() - new Date(g.lastFired).getTime()) / 3600_000)}h ago`
                  : 'never';

                return (
                  <div key={g.id} className={`rounded-lg px-3 py-2 ${g.active ? 'bg-muted/20' : 'bg-muted/10 opacity-50'}`}>
                    <div className="flex items-center gap-2">
                      {g.active ? (
                        <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-[11px] font-mono font-bold text-foreground truncate flex-1">
                        {label}
                      </span>
                      {g.pair && (
                        <Badge variant="outline" className="text-[8px] h-4 px-1 font-mono">{g.pair}</Badge>
                      )}
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Zap className="w-2.5 h-2.5 text-amber-400" />
                        <span className="font-mono">{g.hitCount}×</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 pl-5 text-[9px] text-muted-foreground">
                      <span>Created {ageStr} ago</span>
                      <span>Last fired: {lastFireAge}</span>
                    </div>
                    {g.rule && (
                      <p className="text-[9px] text-muted-foreground mt-0.5 pl-5 line-clamp-1">
                        {g.rule}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
