

# THE CITADEL: Trade Methodology Audit Panel

## Overview
Add a **Trade Methodology** section to Zones 2 (active trades) and Zone 3 (limit orders) that displays each agent's strategic role and generates a real-time "Audit Verdict" explaining WHY the trade is correct (or flagged) based on live 28-Cross Matrix rankings.

## Agent Role Definitions

Each Core 4 agent gets a fixed identity:

| Agent | Role Name | Strategy Description |
|-------|-----------|---------------------|
| m4 | Momentum Sniper | JPY specialist. Targets high-velocity JPY moves and freight-train pullbacks. |
| m6 | Cross-Asset Flow | Patience trap hunter. Waits for limit fills on the current #1 Strength currency. |
| m8 | Pivot Point Momentum | Cable/major momentum. Focuses on USD-weakness plays and pivot breakouts. |
| m9 | Matrix Divergence | Hunts the widest rank gap. Double-exposure specialist on extreme divergences. |

## Audit Verdict Logic

The verdict is generated dynamically using live `currencyRanks` from the Matrix:

1. Extract the base and quote currency from the trade pair
2. Look up their current ranks from the matrix data
3. Generate a human-readable verdict:
   - **If gap is wide (>= 5 ranks apart)**: "CORRECT. [Agent role explanation]. [Base] is #{rank} and [Quote] is #{rank} -- textbook divergence play."
   - **If gap is moderate (3-4)**: "ALIGNED. Gap is narrowing but still valid for [agent role]."
   - **If gap is closing (<= 2)**: "WARNING. Matrix convergence detected. Logic Integrity declining."

## UI Changes

### Zone 2 (Defensive Shield) -- Active Trades
Add a row below each trade card showing:

```text
Agent: m9 | Role: Matrix Divergence | Direction: Short
Verdict: CORRECT. m9 is hunting for the widest gap. EUR is #6 (weak) and AUD is #2 (strong) -- textbook divergence play.
```

Styled as a subtle info strip with:
- Agent badge (blue for MOM)
- Role name in bold
- Verdict text with color coding (green for CORRECT, amber for ALIGNED, red for WARNING)

### Zone 3 (Trap Monitor) -- Limit Orders
Add a "Role" and "Verdict" column to the existing table, replacing the current bare "Strategy" column with richer data:

```text
| Pair     | Agent | Role              | Type      | Entry   | Verdict                                              |
| NZD/JPY  | m8    | Pivot Momentum    | BUY_LIMIT | 91.450  | CORRECT. m8 targeting NZD #1 vs JPY #8 momentum.     |
```

## Technical Details

### New Constants (in TheCitadel.tsx)

```typescript
const AGENT_ROLES: Record<string, { role: string; description: string }> = {
  'atlas-hedge-m4': { role: 'Momentum Sniper', description: 'JPY specialist targeting high-velocity pullbacks' },
  'atlas-hedge-m6': { role: 'Cross-Asset Flow', description: 'Patience trap hunter on #1 Strength currency' },
  'atlas-hedge-m8': { role: 'Pivot Point Momentum', description: 'Major-pair momentum and pivot breakouts' },
  'atlas-hedge-m9': { role: 'Matrix Divergence', description: 'Widest rank-gap hunter, double-exposure specialist' },
};
```

### New Function: `generateVerdict()`

```typescript
function generateVerdict(
  agentId: string, 
  pair: string, 
  direction: string, 
  ranks: Record<string, number>
): { verdict: string; grade: 'CORRECT' | 'ALIGNED' | 'WARNING' }
```

Logic:
1. Split pair into base/quote currencies
2. Get their ranks from the live matrix
3. Compute rank gap
4. Match agent role to expected behavior (e.g., m4 should be on JPY pairs, m9 should have widest gap)
5. Return a verdict string and grade

### Files Modified

**`src/pages/TheCitadel.tsx`** -- Single file change:
- Add `AGENT_ROLES` constant and `generateVerdict()` function
- Update Zone 2 trade cards to include methodology strip below the Logic Integrity bar
- Update Zone 3 table to include Role and Verdict columns
- Verdict uses live `matrix.currencyRanks` already available in state

No new files, no database changes, no edge function changes needed. All data is already fetched.
