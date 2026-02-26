// THE CITADEL — Premium Order Book
// Full institutional trade ledger with methodology verdicts and execution quality

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Filter, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Clock,
} from 'lucide-react';

const AGENT_ROLES: Record<string, { role: string; description: string }> = {
  'atlas-hedge-m4': { role: 'Momentum Sniper', description: 'JPY specialist targeting high-velocity pullbacks' },
  'atlas-hedge-m6': { role: 'Cross-Asset Flow', description: 'Patience trap hunter on #1 Strength currency' },
  'atlas-hedge-m8': { role: 'Pivot Point Momentum', description: 'Major-pair momentum and pivot breakouts' },
  'atlas-hedge-m9': { role: 'Matrix Divergence', description: 'Widest rank-gap hunter, double-exposure specialist' },
};

function getPipMult(pair: string) {
  return pair.includes('JPY') ? 100 : 10000;
}

function computePips(direction: string, entry: number, exit: number, pair: string) {
  const mult = getPipMult(pair);
  return direction === 'long' ? (exit - entry) * mult : (entry - exit) * mult;
}

function formatPrice(price: number, pair: string) {
  return price.toFixed(pair.includes('JPY') ? 3 : 5);
}

export interface OrderBookEntry {
  id: string;
  pair: string;
  agentId: string;
  direction: string;
  status: string;
  entryPrice: number | null;
  exitPrice: number | null;
  requestedPrice: number | null;
  pnlPips: number | null;
  slippage: number | null;
  spread: number | null;
  fillLatency: number | null;
  sovereignTag: string | null;
  sovereignStatus: string | null;
  logicIntegrityAtExit: number | null;
  createdAt: string;
  closedAt: string | null;
  oandaTradeId: string | null;
  oandaOrderId: string | null;
}

interface Props {
  orders: OrderBookEntry[];
  currencyRanks: Record<string, number> | null;
}

type FilterTab = 'all' | 'filled' | 'closed' | 'expired' | 'submitted';
type SortField = 'date' | 'pnl' | 'pair';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  filled: { bg: '#dbeafe', text: '#2563eb', label: 'FILLED' },
  closed: { bg: '#f0fdf4', text: '#16a34a', label: 'CLOSED' },
  expired: { bg: '#fef3c7', text: '#d97706', label: 'EXPIRED' },
  submitted: { bg: '#f3f4f6', text: '#6b7280', label: 'PENDING' },
  open: { bg: '#fef3c7', text: '#d97706', label: 'OPEN' },
  error: { bg: '#fef2f2', text: '#dc2626', label: 'ERROR' },
  cancelled: { bg: '#f3f4f6', text: '#9ca3af', label: 'CANCELLED' },
};

export default function CitadelOrderBook({ orders, currencyRanks }: Props) {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = orders;
    if (filterTab !== 'all') {
      list = list.filter(o => o.status === filterTab);
    }
    list = [...list].sort((a, b) => {
      if (sortField === 'date') {
        const da = new Date(a.closedAt || a.createdAt).getTime();
        const db = new Date(b.closedAt || b.createdAt).getTime();
        return sortAsc ? da - db : db - da;
      }
      if (sortField === 'pnl') {
        return sortAsc ? (a.pnlPips ?? 0) - (b.pnlPips ?? 0) : (b.pnlPips ?? 0) - (a.pnlPips ?? 0);
      }
      return sortAsc ? a.pair.localeCompare(b.pair) : b.pair.localeCompare(a.pair);
    });
    return list;
  }, [orders, filterTab, sortField, sortAsc]);

  const stats = useMemo(() => {
    const closed = orders.filter(o => o.status === 'closed' && o.pnlPips != null);
    const wins = closed.filter(o => (o.pnlPips ?? 0) > 0);
    const netPips = closed.reduce((s, o) => s + (o.pnlPips ?? 0), 0);
    const expired = orders.filter(o => o.status === 'expired').length;
    return {
      total: orders.length,
      closed: closed.length,
      wins: wins.length,
      winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
      netPips: Math.round(netPips * 10) / 10,
      expired,
      active: orders.filter(o => o.status === 'filled').length,
    };
  }, [orders]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: orders.length },
    { key: 'filled', label: 'Active', count: stats.active },
    { key: 'closed', label: 'Closed', count: stats.closed },
    { key: 'expired', label: 'Expired', count: stats.expired },
    { key: 'submitted', label: 'Pending', count: orders.filter(o => o.status === 'submitted').length },
  ];

  return (
    <div className="space-y-3">
      {/* Stats Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Net P&L</span>
          <span className="text-sm font-black" style={{ color: stats.netPips >= 0 ? '#16a34a' : '#dc2626' }}>
            {stats.netPips >= 0 ? '+' : ''}{stats.netPips}p
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Win Rate</span>
          <span className="text-sm font-black text-slate-700">{stats.winRate}%</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Trades</span>
          <span className="text-sm font-black text-slate-700">{stats.closed}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">Expired</span>
          <span className="text-sm font-black text-amber-700">{stats.expired}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className="px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1"
            style={{
              background: filterTab === tab.key ? '#fff' : 'transparent',
              color: filterTab === tab.key ? '#1e293b' : '#94a3b8',
              boxShadow: filterTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.label}
            <span className="text-[8px] font-mono opacity-60">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px] cursor-pointer select-none"
                  onClick={() => toggleSort('date')}>
                  <span className="flex items-center gap-1">
                    Date {sortField === 'date' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </span>
                </th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px] cursor-pointer select-none"
                  onClick={() => toggleSort('pair')}>
                  <span className="flex items-center gap-1">
                    Pair {sortField === 'pair' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </span>
                </th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Agent</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Role</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Dir</th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Status</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Entry</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Exit</th>
                <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px] cursor-pointer select-none"
                  onClick={() => toggleSort('pnl')}>
                  <span className="flex items-center gap-1 justify-end">
                    P&L {sortField === 'pnl' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </span>
                </th>
                <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-xs">
                    No orders found
                  </td>
                </tr>
              ) : (
                filtered.map(order => {
                  const role = AGENT_ROLES[order.agentId];
                  const statusStyle = STATUS_COLORS[order.status] ?? STATUS_COLORS.error;
                  const isExpanded = expandedId === order.id;
                  const ts = new Date(order.closedAt || order.createdAt);

                  // Verdict from current ranks
                  let verdictGrade: 'CORRECT' | 'ALIGNED' | 'WARNING' | null = null;
                  let verdictText = '';
                  if (currencyRanks) {
                    const parts = order.pair.replace('_', '/').split('/');
                    const baseR = currencyRanks[parts[0]];
                    const quoteR = currencyRanks[parts[1]];
                    if (baseR != null && quoteR != null) {
                      const gap = Math.abs(baseR - quoteR);
                      if (gap >= 5) { verdictGrade = 'CORRECT'; verdictText = `Gap ${gap}: ${parts[0]}#${baseR} vs ${parts[1]}#${quoteR}`; }
                      else if (gap >= 3) { verdictGrade = 'ALIGNED'; verdictText = `Gap ${gap}: narrowing`; }
                      else { verdictGrade = 'WARNING'; verdictText = `Gap ${gap}: convergence`; }
                    }
                  }

                  const gradeColor = verdictGrade === 'CORRECT' ? '#16a34a'
                    : verdictGrade === 'WARNING' ? '#dc2626' : '#f59e0b';

                  return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b cursor-pointer hover:bg-slate-50/50 transition-colors"
                      style={{ borderColor: '#f1f5f9' }}
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      <td className="px-3 py-2.5 text-slate-400 font-mono text-[10px] whitespace-nowrap">
                        {ts.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        <br />
                        <span className="text-[8px]">{ts.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-800">
                        {order.pair.replace('_', '/')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{ background: '#dbeafe', color: '#2563eb' }}>
                          {order.agentId.replace('atlas-hedge-', '').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[10px] font-bold text-slate-600 whitespace-nowrap">
                        {role?.role ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`font-bold text-[10px] ${order.direction === 'long' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {order.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={{ background: statusStyle.bg, color: statusStyle.text }}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                        {order.entryPrice ? formatPrice(order.entryPrice, order.pair) : order.requestedPrice ? formatPrice(order.requestedPrice, order.pair) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                        {order.exitPrice ? formatPrice(order.exitPrice, order.pair) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black">
                        {order.pnlPips != null ? (
                          <span style={{ color: order.pnlPips >= 0 ? '#16a34a' : '#dc2626' }}>
                            {order.pnlPips >= 0 ? '+' : ''}{order.pnlPips.toFixed(1)}p
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {verdictGrade && (
                          <div className="flex items-center gap-1 text-[10px]">
                            <span className="font-black" style={{ color: gradeColor }}>{verdictGrade}</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded Detail Row (rendered below table as an overlay-style panel) */}
        {expandedId && (() => {
          const order = filtered.find(o => o.id === expandedId);
          if (!order) return null;
          const role = AGENT_ROLES[order.agentId];

          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-3 space-y-2"
              style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}
            >
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Execution Detail — {order.pair.replace('_', '/')} #{order.oandaTradeId || order.oandaOrderId || order.id.slice(0, 8)}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Execution Quality */}
                <div className="rounded-lg p-2.5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                  <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">Slippage</div>
                  <div className="text-sm font-black text-slate-700">
                    {order.slippage != null ? `${order.slippage.toFixed(1)}p` : '—'}
                  </div>
                </div>
                <div className="rounded-lg p-2.5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                  <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">Spread</div>
                  <div className="text-sm font-black text-slate-700">
                    {order.spread != null ? `${order.spread.toFixed(1)}p` : '—'}
                  </div>
                </div>
                <div className="rounded-lg p-2.5" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                  <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">Fill Latency</div>
                  <div className="text-sm font-black text-slate-700">
                    {order.fillLatency != null ? `${order.fillLatency}ms` : '—'}
                  </div>
                </div>
                {/* Sovereign Override */}
                <div className="rounded-lg p-2.5" style={{
                  background: order.sovereignTag ? '#fef2f2' : '#fff',
                  border: `1px solid ${order.sovereignTag ? '#fecaca' : '#e5e7eb'}`,
                }}>
                  <div className="text-[8px] text-slate-400 uppercase tracking-wider mb-1">Sovereign Exit</div>
                  <div className="text-sm font-black" style={{ color: order.sovereignTag ? '#dc2626' : '#16a34a' }}>
                    {order.sovereignTag || 'None'}
                  </div>
                  {order.sovereignStatus && (
                    <div className="text-[8px] text-slate-400 mt-0.5">{order.sovereignStatus}</div>
                  )}
                </div>
              </div>

              {/* Methodology */}
              {role && (
                <div className="flex items-center gap-2 mt-1 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: '#dbeafe', color: '#2563eb' }}>
                    {order.agentId.replace('atlas-hedge-', '').toUpperCase()}
                  </span>
                  <span className="font-bold text-slate-700">{role.role}</span>
                  <span className="text-slate-400">— {role.description}</span>
                </div>
              )}
            </motion.div>
          );
        })()}
      </div>

      <div className="text-[9px] text-slate-400 text-center">
        Showing {filtered.length} of {orders.length} orders · Last 90 days
      </div>
    </div>
  );
}