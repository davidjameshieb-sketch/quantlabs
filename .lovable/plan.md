
# Update Forex Command Center to Use Only Real Trade Data

## Problem
The Forex Command Center, Performance tab, Governance tab, and Edge Health sidebar still reference **simulated/generated trade data** from `generateForexTrades()`. This legacy data pipeline produces fabricated trades that contaminate dashboards with outdated, inaccurate metrics. Since the trading system was revamped to use indicator-confirmed, directional-regime-gated entries, all UI components must reflect only real OANDA execution data.

## What Changes

### 1. Remove Simulated Trade Generation from ForexDashboard
**File:** `src/pages/ForexDashboard.tsx`

- Remove `generateForexTrades`, `filterForexTrades`, `computeForexPerformance`, `getLastGovernanceStats` imports and usage
- Remove `createAgents` import and `agents` / `allTrades` / `filteredTrades` / `performance` / `governanceStats` memos
- All panels that currently receive `filteredTrades` or `allTrades` will instead use real OANDA data from `executionMetrics` and `tradeAnalytics`

### 2. Update Command Center Tab (Tab 1)
- **Counterfactual Panel cheat sheet**: Replace simulated `allTrades.filter(avoided)` stats with a note that counterfactual tracking is now handled server-side via the `forex-counterfactual-resolver` edge function. Show real counts from `executionMetrics` if available, or display "Server-side tracking active"
- **Trade Quality Watchdog cheat sheet**: Already uses `realMetrics` -- no change needed

### 3. Update Performance Tab (Tab 2)
- **ForexPerformanceOverview**: Remove `trades={filteredTrades}` and `metrics={performance}` props. The component already has `realMetrics` and `tradeAnalytics` -- make it show "Waiting for real data" instead of falling back to simulated data
- **ForexTradeHistoryTable**: Remove `trades={filteredTrades}` -- replace with a real OANDA order history table that reads from `executionMetrics.recentOrders`
- **Trade History cheat sheet**: Stats derived from `filteredTrades` replaced with `executionMetrics` counts

### 4. Update Governance Tab (Tab 3)
- **GovernanceHealthDashboard**: Remove `trades={filteredTrades}` prop. The governance health monitor uses in-memory governance analytics (pass rates, gate frequency) which are independent of trade data. For the `ExecutionPerformancePanel`, pass real orders from `executionMetrics`
- **Governance Health cheat sheet**: Replace `filteredTrades` stats with real order counts from `executionMetrics`
- **Governance pass/block rate meters**: Derive from real orders instead of simulated trades

### 5. Update Edge Health Sidebar
**File:** `src/components/dashboard/EdgeHealthSidebar.tsx`

- The sidebar reads from the `edge_health_summary` snapshot. Add a "Strategy Revamp" indicator showing that data reflects only post-revamp trades
- Update the `BADGE_RULES` tooltip to note "Post-revamp data only"

### 6. Update Edge Health Stats Hook
**File:** `src/hooks/useEdgeHealthStats.ts`

- The snapshot scope key `all:30` already limits to 30-day window which should contain mostly post-revamp data
- Add a `dataEra` field to indicate "post-revamp" status

### 7. Clean Up ForexPerformanceOverview Simulated Fallback
**File:** `src/components/forex/ForexPerformanceOverview.tsx`

- Remove the simulated fallback paths in `headlineMetrics` and `scalpForensics`
- When no real data is available, show a clear "Awaiting real trade data" message instead of fake numbers

### 8. Update GovernanceHealthDashboard
**File:** `src/components/forex/GovernanceHealthDashboard.tsx`

- Make the `trades` prop optional and default to empty
- When no real trades provided, show governance analytics (pass rates, gate frequency, alerts) without the execution performance section

## Technical Details

### Files Modified
1. `src/pages/ForexDashboard.tsx` -- Remove simulated trade pipeline, wire all panels to real data
2. `src/components/forex/ForexPerformanceOverview.tsx` -- Remove simulated fallbacks, show "awaiting data" state
3. `src/components/forex/GovernanceHealthDashboard.tsx` -- Decouple from simulated trade dependency
4. `src/components/dashboard/EdgeHealthSidebar.tsx` -- Add post-revamp data indicator
5. `src/hooks/useEdgeHealthStats.ts` -- Add data era metadata

### What Stays
- `generateForexTrades` and `forexEngine.ts` remain in the codebase for the Archive tab and ForexOanda page (legacy reference)
- The Archive tab continues to show historical/simulated data explicitly labeled as "Archive"
- All real-time panels (Command Center, Performance, Governance) use only OANDA execution data
- The `governanceDashboard` computation already prefers real OANDA orders -- this stays and the simulated fallback is removed
