// Forex Trade History Table
// Comprehensive forex-only trade log

import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown, Ban } from 'lucide-react';
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
              <TableHead className="text-[10px] font-display">Duration</TableHead>
              <TableHead className="text-[10px] font-display">Agent</TableHead>
              <TableHead className="text-[10px] font-display">Governance</TableHead>
              <TableHead className="text-[10px] font-display">Conf</TableHead>
              <TableHead className="text-[10px] font-display">Risk</TableHead>
              <TableHead className="text-[10px] font-display">Outcome</TableHead>
              <TableHead className="text-[10px] font-display">Exec Mode</TableHead>
              <TableHead className="text-[10px] font-display">Regime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(trade => {
              const isExpanded = expandedId === trade.id;
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
                    <TableCell className="font-mono text-xs font-bold">{trade.pairName}</TableCell>
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
                      {trade.pnlPercent > 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
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
                        trade.governanceStatus === 'approved' ? 'text-neural-green border-neural-green/30' :
                        trade.governanceStatus === 'throttled' ? 'text-neural-orange border-neural-orange/30' :
                        'text-neural-red border-neural-red/30'
                      )}>
                        {trade.governanceStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] font-mono">{trade.confidenceScore.toFixed(0)}%</TableCell>
                    <TableCell className="text-[11px] font-mono">{trade.riskScore.toFixed(0)}%</TableCell>
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
                      <Badge variant="outline" className={cn('text-[8px]', EXECUTION_MODE_COLORS[trade.executionMode])}>
                        {trade.executionMode === 'signal-only' ? 'Signal' : trade.executionMode === 'assisted-ready' ? 'Assisted' : 'Auto'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[8px]', FOREX_REGIME_COLORS[trade.regime])}>
                        {FOREX_REGIME_LABELS[trade.regime].replace(' FX', '')}
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {/* Expanded: Agent Contribution Detail */}
                  {isExpanded && (
                    <TableRow key={`${trade.id}-exp`} className="bg-primary/5 hover:bg-primary/5">
                      <TableCell colSpan={14} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          </div>

                          {/* Supporting Agents */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">Supporting Agents</p>
                            <div className="space-y-1">
                              {trade.supportingAgents.map(a => (
                                <div key={a.id} className="flex items-center justify-between p-1.5 rounded bg-card/30 border border-border/30">
                                  <span className="text-[10px]">{a.icon} {a.name}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{(a.weight * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Execution Status */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">Execution Status</p>
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
