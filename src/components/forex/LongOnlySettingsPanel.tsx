// Long-Only Mode Settings Panel — for Settings → Execution

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, Eye } from 'lucide-react';
import {
  isLongOnlyEnabled,
  isLongOnlyForcedByEnv,
  getTradingMode,
  setTradingMode,
  isShadowShortsEnabled,
  setShadowShortsEnabled,
} from '@/lib/config/tradingMode';
import { useState, useCallback } from 'react';

export function LongOnlySettingsPanel() {
  const [longOnly, setLongOnly] = useState(isLongOnlyEnabled);
  const [shadowShorts, setShadowShorts] = useState(isShadowShortsEnabled);
  const forced = isLongOnlyForcedByEnv();

  const handleToggle = useCallback((checked: boolean) => {
    setTradingMode(checked ? 'LONG_ONLY' : 'NORMAL');
    setLongOnly(checked);
  }, []);

  const handleShadowToggle = useCallback((checked: boolean) => {
    setShadowShortsEnabled(checked);
    setShadowShorts(checked);
  }, []);

  return (
    <Card className="bg-card/60 border-border/30">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Execution Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Long-Only Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Long-Only Mode</span>
              {longOnly && (
                <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[hsl(var(--neural-green))]/30 text-[hsl(var(--neural-green))]">
                  ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Block all short trades at governance + execution level.
            </p>
          </div>
          <Switch
            checked={longOnly}
            onCheckedChange={handleToggle}
            disabled={forced}
          />
        </div>

        {forced && (
          <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--neural-orange))]">
            <AlertTriangle className="w-3 h-3" />
            Forced ON by environment variable (FOREX_LONG_ONLY=true)
          </div>
        )}

        {/* Shadow Shorts Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Shadow-evaluate blocked shorts</span>
              <Eye className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Log short evaluations without executing — verify shorts remain unprofitable.
            </p>
          </div>
          <Switch
            checked={shadowShorts}
            onCheckedChange={handleShadowToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
