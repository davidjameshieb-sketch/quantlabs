// Forex Quality & Risk Panels
// Trade quality metrics and risk governance monitoring

import { Shield, Target, Crosshair, Gauge, Activity, AlertTriangle, TrendingDown, BarChart3 } from 'lucide-react';
import { ForexQualityMetrics, ForexRiskGovernance, FOREX_REGIME_LABELS, ForexRegime } from '@/lib/forex/forexTypes';
import { cn } from '@/lib/utils';

// ─── Quality Metrics Panel ───

interface ForexQualityPanelProps {
  quality: ForexQualityMetrics;
}

const QualityBar = ({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <span className={cn(
        'text-[10px] font-mono font-bold',
        value >= 70 ? 'text-neural-green' : value >= 50 ? 'text-neural-orange' : 'text-neural-red'
      )}>
        {value.toFixed(1)}%
      </span>
    </div>
    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          value >= 70 ? 'bg-neural-green' : value >= 50 ? 'bg-neural-orange' : 'bg-neural-red'
        )}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  </div>
);

export const ForexQualityPanel = ({ quality }: ForexQualityPanelProps) => (
  <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
    <div className="flex items-center gap-2">
      <Target className="w-4 h-4 text-primary" />
      <h3 className="text-xs font-display font-bold">Trade Quality Metrics</h3>
    </div>
    <div className="space-y-2.5">
      <QualityBar label="Trade Efficiency Score" value={quality.tradeEfficiency} icon={Gauge} />
      <QualityBar label="Entry Timing Accuracy" value={quality.entryTimingAccuracy} icon={Crosshair} />
      <QualityBar label="Exit Efficiency Accuracy" value={quality.exitEfficiency} icon={Target} />
      <QualityBar label="Spread Sensitivity Impact" value={quality.spreadSensitivity} icon={Activity} />
    </div>

    {/* Regime Performance */}
    <div className="pt-2 border-t border-border/30 space-y-2">
      <p className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider">
        Volatility Regime Performance
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(quality.volatilityRegimePerformance) as ForexRegime[]).map(regime => (
          <div key={regime} className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/30">
            <span className="text-[9px]">{FOREX_REGIME_LABELS[regime]}</span>
            <span className={cn(
              'text-[10px] font-mono font-bold',
              quality.volatilityRegimePerformance[regime] >= 55 ? 'text-neural-green' : 'text-neural-orange'
            )}>
              {quality.volatilityRegimePerformance[regime].toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Risk Governance Panel ───

interface ForexRiskGovernancePanelProps {
  risk: ForexRiskGovernance;
}

export const ForexRiskGovernancePanel = ({ risk }: ForexRiskGovernancePanelProps) => (
  <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
    <div className="flex items-center gap-2">
      <Shield className="w-4 h-4 text-primary" />
      <h3 className="text-xs font-display font-bold">Forex Risk Governance</h3>
    </div>
    <div className="space-y-2.5">
      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/30">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3 h-3 text-neural-red" />
          <span className="text-[10px]">Max Drawdown</span>
        </div>
        <span className={cn(
          'text-xs font-mono font-bold',
          risk.maxDrawdown > 4 ? 'text-neural-red' : risk.maxDrawdown > 2 ? 'text-neural-orange' : 'text-neural-green'
        )}>
          {risk.maxDrawdown.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10 border border-border/30">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-neural-orange" />
          <span className="text-[10px]">Daily Loss Rate</span>
        </div>
        <span className={cn(
          'text-xs font-mono font-bold',
          risk.dailyLossRate > 2 ? 'text-neural-red' : 'text-neural-green'
        )}>
          {risk.dailyLossRate.toFixed(2)}%
        </span>
      </div>
      <QualityBar label="Position Size Compliance" value={risk.positionSizeCompliance} icon={Shield} />
      <QualityBar label="Exposure Concentration" value={100 - risk.exposureConcentration} icon={BarChart3} />
      <QualityBar label="Trade Frequency Stability" value={risk.tradeFrequencyStability} icon={Activity} />
    </div>
  </div>
);
