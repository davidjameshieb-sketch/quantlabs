// Rules Editor — toggleable sessions/pairs/directions/agents + sliders + conditional rules
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Trash2, Upload, Filter } from 'lucide-react';
import type { FilterRuleSet, SerializableRuleSet } from '@/lib/forex/filterSimulator';
import type { NormalizedTrade } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  rules: FilterRuleSet;
  onChange: (r: FilterRuleSet) => void;
  trades: NormalizedTrade[];
  savedSets: SerializableRuleSet[];
  onLoad: (name: string) => void;
  onDelete: (name: string) => void;
}

export const FilterRulesEditor = ({ rules, onChange, trades, savedSets, onLoad, onDelete }: Props) => {
  // Unique values from trades
  const sessions = [...new Set(trades.map(t => t.session))].sort();
  const pairs = [...new Set(trades.map(t => t.symbol))].sort();
  const agents = [...new Set(trades.map(t => t.agentId))].sort();

  const toggleBlock = (list: string[], item: string, field: keyof FilterRuleSet) => {
    const current = list.includes(item) ? list.filter(x => x !== item) : [...list, item];
    onChange({ ...rules, [field]: current });
  };

  return (
    <div className="space-y-4">
      {/* Saved rule sets */}
      {savedSets.length > 0 && (
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Saved Rule Sets</CardTitle>
          </CardHeader>
          <CardContent className="p-3 flex flex-wrap gap-2">
            {savedSets.map(s => (
              <div key={s.name} className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="text-[10px] h-6" onClick={() => onLoad(s.name)}>
                  <Upload className="w-3 h-3 mr-1" />{s.name}
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 w-6 p-0 text-neural-red" onClick={() => onDelete(s.name)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Block Sessions */}
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Block Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 flex flex-wrap gap-1.5">
            {sessions.map(s => (
              <Badge
                key={s}
                variant={rules.blockSessions.includes(s) ? 'destructive' : 'outline'}
                className="text-[9px] cursor-pointer"
                onClick={() => toggleBlock(rules.blockSessions, s, 'blockSessions')}
              >
                {s}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* Block Pairs */}
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Block Pairs</CardTitle>
          </CardHeader>
          <CardContent className="p-3 flex flex-wrap gap-1.5">
            {pairs.map(p => (
              <Badge
                key={p}
                variant={rules.blockPairs.includes(p) ? 'destructive' : 'outline'}
                className="text-[9px] cursor-pointer"
                onClick={() => toggleBlock(rules.blockPairs, p, 'blockPairs')}
              >
                {p}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* Block Agents */}
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Block Agents</CardTitle>
          </CardHeader>
          <CardContent className="p-3 flex flex-wrap gap-1.5">
            {agents.map(a => (
              <Badge
                key={a}
                variant={rules.blockAgents.includes(a) ? 'destructive' : 'outline'}
                className="text-[9px] cursor-pointer"
                onClick={() => toggleBlock(rules.blockAgents, a, 'blockAgents')}
              >
                {a}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {/* Block Directions */}
        <Card className="border-border/30 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Block Directions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 flex gap-3">
            {(['long', 'short'] as const).map(d => (
              <Badge
                key={d}
                variant={rules.blockDirections.includes(d) ? 'destructive' : 'outline'}
                className="text-[9px] cursor-pointer"
                onClick={() => toggleBlock(rules.blockDirections, d, 'blockDirections')}
              >
                {d}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Thresholds */}
      <Card className="border-border/30 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-display">Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Min Composite Score</label>
                <span className="text-[10px] font-mono">{rules.minCompositeScore ?? 'Off'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rules.minCompositeScore != null}
                  onCheckedChange={v => onChange({ ...rules, minCompositeScore: v ? 0.72 : null })}
                />
                {rules.minCompositeScore != null && (
                  <Slider
                    value={[rules.minCompositeScore]}
                    onValueChange={([v]) => onChange({ ...rules, minCompositeScore: Math.round(v * 100) / 100 })}
                    min={0.5}
                    max={0.95}
                    step={0.01}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Min QL Confidence</label>
                <span className="text-[10px] font-mono">{rules.minQuantLabsConfidence ?? 'Off'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rules.minQuantLabsConfidence != null}
                  onCheckedChange={v => onChange({ ...rules, minQuantLabsConfidence: v ? 0.60 : null })}
                />
                {rules.minQuantLabsConfidence != null && (
                  <Slider
                    value={[rules.minQuantLabsConfidence]}
                    onValueChange={([v]) => onChange({ ...rules, minQuantLabsConfidence: Math.round(v * 100) / 100 })}
                    min={0.3}
                    max={0.95}
                    step={0.01}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Max Spread (pips)</label>
                <span className="text-[10px] font-mono">{rules.maxSpreadPips ?? 'Off'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rules.maxSpreadPips != null}
                  onCheckedChange={v => onChange({ ...rules, maxSpreadPips: v ? 15 : null })}
                />
                {rules.maxSpreadPips != null && (
                  <Slider
                    value={[rules.maxSpreadPips]}
                    onValueChange={([v]) => onChange({ ...rules, maxSpreadPips: Math.round(v * 10) / 10 })}
                    min={1}
                    max={30}
                    step={0.5}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-muted-foreground">Max Friction</label>
                <span className="text-[10px] font-mono">{rules.maxFriction ?? 'Off'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rules.maxFriction != null}
                  onCheckedChange={v => onChange({ ...rules, maxFriction: v ? 0.70 : null })}
                />
                {rules.maxFriction != null && (
                  <Slider
                    value={[rules.maxFriction]}
                    onValueChange={([v]) => onChange({ ...rules, maxFriction: Math.round(v * 100) / 100 })}
                    min={0.1}
                    max={1.0}
                    step={0.01}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditional Rules */}
      <Card className="border-border/30 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-display">Conditional Rules</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {rules.conditionalRules.map((rule, idx) => (
            <div key={rule.id} className="flex items-center gap-2">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => {
                  const updated = [...rules.conditionalRules];
                  updated[idx] = { ...updated[idx], enabled: checked };
                  onChange({ ...rules, conditionalRules: updated });
                }}
              />
              <span className="text-[10px]">{rule.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
