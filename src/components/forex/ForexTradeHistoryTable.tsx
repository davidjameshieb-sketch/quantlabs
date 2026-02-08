// Forex Trade History Table
// Comprehensive forex-only trade log with scalping P&L forensics

import { useState, useMemo } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown, Ban, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ForexTradeEntry,
  EXECUTION_MODE_LABELS,
  EXECUTION_MODE_COLORS,
  FOREX_REGIME_LABELS,
  FOREX_REGIME_COLORS,
} from '@/lib/forex/forexTypes';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';

interface ForexTradeHistoryTableProps {
  trades: ForexTradeEntry[];
}

// ─── Cumulative P&L Summary Strip ───

const PnlSummaryStrip = ({ trades }: { trades: ForexTradeEntry[] }) => {
  const stats = useMemo(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    const wins = executed.filter(t => t.pnlPercent > 0);
    const losses = executed.filter(t => t.pnlPercent <= 0);
    const totalPnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
    const totalNetPnl = executed.reduce((s, t) => s + t.netExpectancy, 0);
    const avgCapture = executed.length > 0 ? executed.reduce((s, t) => s + t.captureRatio, 0) / executed.length : 0;
    const avgGiveBack = wins.length > 0 ? wins.reduce((s, t) => s + t.giveBackPct, 0) / wins.length : 0;
    const totalFriction = executed.reduce((s, t) => s + t.frictionCost, 0);
    return { executed: executed.length, wins: wins.length, losses: losses.length, totalPnl, totalNetPnl, avgCapture, avgGiveBack, totalFriction };
  }, [trades]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {[
        { label: 'Executed', value: stats.executed.toString() },
        { label: 'W / L', value: `${stats.wins} / ${stats.losses}`, color: stats.wins > stats.losses ? 'text-neural-green' : 'text-neural-red' },
        { label: 'Gross P&L', value: `${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}%`, color: stats.totalPnl >= 0 ? 'text-neural-green' : 'text-neural-red' },
        { label: 'Net P&L', value: `${stats.totalNetPnl >= 0 ? '+' : ''}${stats.totalNetPnl.toFixed(2)}%`, color: stats.totalNetPnl >= 0 ? 'text-neural-green' : 'text-neural-red' },
        { label: 'Capture', value: `${(stats.avgCapture * 100).toFixed(0)}%`, color: stats.avgCapture > 0.6 ? 'text-neural-green' : 'text-neural-orange' },
        { label: 'Give-Back', value: `${stats.avgGiveBack.toFixed(1)}%`, color: stats.avgGiveBack < 30 ? 'text-neural-green' : 'text-neural-red' },
        { label: 'Friction', value: `${stats.totalFriction.toFixed(3)}%`, color: 'text-muted-foreground' },
        { label: 'Win Rate', value: `${stats.executed > 0 ? ((stats.wins / stats.executed) * 100).toFixed(1) : 0}%`, color: stats.wins / (stats.executed || 1) > 0.55 ? 'text-neural-green' : 'text-neural-red' },
      ].map(item => (
        <div key={item.label} className="p-2 rounded-lg bg-card/50 border border-border/30 text-center">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
          <p className={cn('text-sm font-mono font-bold', item.color || 'text-foreground')}>{item.value}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Exit Quality Grade ───

const getExitGrade = (captureRatio: number): { grade: string; color: string } => {
  if (captureRatio >= 0.8) return { grade: 'A', color: 'text-neural-green' };
  if (captureRatio >= 0.6) return { grade: 'B', color: 'text-primary' };
  if (captureRatio >= 0.4) return { grade: 'C', color: 'text-neural-orange' };
  return { grade: 'D', color: 'text-neural-red' };
};

export const ForexTradeHistoryTable = ({ trades }: ForexTradeHistoryTableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageSize] = useState(20);
  const [page, setPage] = useState(0);

  const paged = trades.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(trades.length / pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold">Forex Trade History</h3>
        <span className="text-[10px] text-muted-foreground">{trades.length} total trades</span>
      </div>

      {/* P&L Summary Strip */}
      <PnlSummaryStrip trades={trades} />

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-card/50 hover:bg-card/50">
              <TableHead className="text-[10px] font-display w-8"></TableHead>
              <TableHead className="text-[10px] font-display">Pair</TableHead>
              <TableHead className="text-[10px] font-display">Dir</TableHead>
              <TableHead className="text-[10px] font-display">Entry</TableHead>
              <TableHead className="text-[10px] font-display">Exit</TableHead>
              <TableHead className="text-[10px] font-display">P&L</TableHead>
              <TableHead className="text-[10px] font-display">Net P&L</TableHead>
              <TableHead className="text-[10px] font-display">MFE</TableHead>
              <TableHead className="text-[10px] font-display">Capture</TableHead>
              <TableHead className="text-[10px] font-display">Grade</TableHead>
              <TableHead className="text-[10px] font-display">Duration</TableHead>
              <TableHead className="text-[10px] font-display">Agent</TableHead>
              <TableHead className="text-[10px] font-display">Outcome</TableHead>
              <TableHead className="text-[10px] font-display">Regime</TableHead>
              <TableHead className="text-[10px] font-display">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(trade => {
              const isExpanded = expandedId === trade.id;
              const exitGrade = getExitGrade(trade.captureRatio);
              return (
                <>
                  <TableRow
                    key={trade.id}
                    className="cursor-pointer hover:bg-primary/5 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                  >
                    <TableCell className="p-2">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">
                      <div className="flex items-center gap-1.5">
                        {trade.pairName}
                        {trade.tradeDuration <= 15 && (
                          <Badge className="text-[7px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30 font-display uppercase tracking-wider">
                            Scalp
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[9px] gap-0.5',
                        trade.direction === 'long' ? 'text-neural-green border-neural-green/30' : 'text-neural-red border-neural-red/30'
                      )}>
                        {trade.direction === 'long' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                        {trade.direction.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{trade.entryPrice.toFixed(trade.currencyPair.includes('JPY') ? 3 : 5)}</TableCell>
                    <TableCell className="font-mono text-[11px]">{trade.exitPrice ? trade.exitPrice.toFixed(trade.currencyPair.includes('JPY') ? 3 : 5) : '—'}</TableCell>
                    <TableCell className={cn('font-mono text-[11px] font-bold', trade.pnlPercent > 0 ? 'text-neural-green' : trade.pnlPercent < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                      {trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent.toFixed(3)}%
                    </TableCell>
                    <TableCell className={cn('font-mono text-[11px]', trade.netExpectancy > 0 ? 'text-neural-green' : trade.netExpectancy < 0 ? 'text-neural-red' : 'text-muted-foreground')}>
                      {trade.netExpectancy > 0 ? '+' : ''}{trade.netExpectancy.toFixed(3)}%
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-neural-green">
                      {trade.mfe > 0 ? `+${trade.mfe.toFixed(3)}%` : '—'}
                    </TableCell>
                    <TableCell className={cn('font-mono text-[11px] font-semibold', trade.captureRatio > 0.6 ? 'text-neural-green' : trade.captureRatio > 0.3 ? 'text-neural-orange' : 'text-neural-red')}>
                      {trade.outcome !== 'avoided' ? `${(trade.captureRatio * 100).toFixed(0)}%` : '—'}
                    </TableCell>
                    <TableCell>
                      {trade.outcome !== 'avoided' ? (
                        <span className={cn('font-mono text-xs font-bold', exitGrade.color)}>{exitGrade.grade}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {trade.tradeDuration < 60 ? `${trade.tradeDuration}m` : `${(trade.tradeDuration / 60).toFixed(1)}h`}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      <span title={trade.primaryAgentName}>{trade.primaryAgentIcon} {trade.primaryAgentName.split(' ')[0]}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[9px]',
                        trade.outcome === 'win' ? 'text-neural-green border-neural-green/30' :
                        trade.outcome === 'loss' ? 'text-neural-red border-neural-red/30' :
                        'text-muted-foreground border-border/50'
                      )}>
                        {trade.outcome === 'avoided' && <Ban className="w-2.5 h-2.5 mr-0.5" />}
                        {trade.outcome.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[8px]', FOREX_REGIME_COLORS[trade.regime])}>
                        {FOREX_REGIME_LABELS[trade.regime].replace(' FX', '')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(trade.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                  </TableRow>

                  {/* Expanded: Scalping Forensics Detail */}
                  {isExpanded && (
                    <TableRow key={`${trade.id}-exp`} className="bg-primary/5 hover:bg-primary/5">
                      <TableCell colSpan={15} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {/* P&L Forensics */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">P&L Forensics</p>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Gross P&L:</span><span className={cn('font-mono font-semibold', trade.pnlPercent > 0 ? 'text-neural-green' : 'text-neural-red')}>{trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent.toFixed(4)}%</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Friction Cost:</span><span className="font-mono text-neural-orange">-{trade.frictionCost.toFixed(4)}%</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Net P&L:</span><span className={cn('font-mono font-bold', trade.netExpectancy > 0 ? 'text-neural-green' : 'text-neural-red')}>{trade.netExpectancy > 0 ? '+' : ''}{trade.netExpectancy.toFixed(4)}%</span></div>
                            </div>
                          </div>

                          {/* MFE / MAE */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">MFE / MAE</p>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">MFE (Peak):</span><span className="font-mono text-neural-green">+{trade.mfe.toFixed(4)}%</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">MAE (Trough):</span><span className="font-mono text-neural-red">-{trade.mae.toFixed(4)}%</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Capture Ratio:</span><span className={cn('font-mono font-semibold', trade.captureRatio > 0.6 ? 'text-neural-green' : 'text-neural-orange')}>{(trade.captureRatio * 100).toFixed(1)}%</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Give-Back:</span><span className={cn('font-mono', trade.giveBackPct < 25 ? 'text-neural-green' : 'text-neural-orange')}>{trade.giveBackPct.toFixed(1)}%</span></div>
                            </div>
                          </div>

                          {/* Primary Agent */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">Primary Agent</p>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-card/50 border border-border/50">
                              <span className="text-xl">{trade.primaryAgentIcon}</span>
                              <div>
                                <p className="text-xs font-bold">{trade.primaryAgentName}</p>
                                <p className="text-[10px] text-muted-foreground">{AGENT_DEFINITIONS[trade.primaryAgent].model}</p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {trade.supportingAgents.slice(0, 3).map(a => (
                                <div key={a.id} className="flex items-center justify-between p-1.5 rounded bg-card/30 border border-border/30">
                                  <span className="text-[10px]">{a.icon} {a.name}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{(a.weight * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Execution Status */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">Execution</p>
                            <div className="space-y-1.5 text-[10px]">
                              <div className="flex items-center gap-1.5">
                                <span className={cn('w-2 h-2 rounded-full', trade.oandaCompatible ? 'bg-neural-green' : 'bg-neural-red')} />
                                <span>OANDA Compatible</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={cn('w-2 h-2 rounded-full', trade.riskCompliant ? 'bg-neural-green' : 'bg-neural-red')} />
                                <span>Risk Compliant</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={cn('w-2 h-2 rounded-full',
                                  trade.spreadCondition === 'tight' ? 'bg-neural-green' :
                                  trade.spreadCondition === 'normal' ? 'bg-neural-orange' : 'bg-neural-red'
                                )} />
                                <span>Spread: {trade.spreadCondition}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={cn('w-2 h-2 rounded-full', trade.governanceStatus === 'approved' ? 'bg-neural-green' : trade.governanceStatus === 'throttled' ? 'bg-neural-orange' : 'bg-neural-red')} />
                                <span>Gov: {trade.governanceStatus}</span>
                              </div>
                              <p className="mt-1 text-muted-foreground">{EXECUTION_MODE_LABELS[trade.executionMode]}</p>
                              <p className="text-muted-foreground/70">
                                {new Date(trade.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-xs rounded-md border border-border/50 disabled:opacity-30 hover:bg-muted/30 transition-colors"
          >
            Prev
          </button>
          <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-xs rounded-md border border-border/50 disabled:opacity-30 hover:bg-muted/30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
