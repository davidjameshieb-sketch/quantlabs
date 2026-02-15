// Synthetic Pair Constructor
// Allows the FM to define weighted currency baskets and track them as single tickers

export interface SyntheticLeg {
  pair: string;      // e.g. "EUR_USD"
  weight: number;    // e.g. 0.5
  invert?: boolean;  // true = use 1/price
}

export interface SyntheticPair {
  name: string;           // e.g. "USD-BLOC"
  legs: SyntheticLeg[];
  description?: string;
}

export interface SyntheticQuote {
  name: string;
  value: number;
  change: number;       // vs previous
  changePct: number;
  legs: { pair: string; price: number; weight: number; contribution: number }[];
  timestamp: string;
}

// Prebuilt baskets the FM can reference
export const PREBUILT_BASKETS: SyntheticPair[] = [
  {
    name: 'USD-BLOC',
    description: 'USD strength vs major bloc (EUR+GBP equally weighted)',
    legs: [
      { pair: 'EUR_USD', weight: 0.5, invert: true },
      { pair: 'GBP_USD', weight: 0.5, invert: true },
    ],
  },
  {
    name: 'RISK-ON',
    description: 'Risk appetite proxy (AUD+NZD vs USD)',
    legs: [
      { pair: 'AUD_USD', weight: 0.5 },
      { pair: 'NZD_USD', weight: 0.5 },
    ],
  },
  {
    name: 'SAFE-HAVEN',
    description: 'Safe haven flow (JPY+CHF strength vs USD)',
    legs: [
      { pair: 'USD_JPY', weight: 0.5, invert: true },
      { pair: 'USD_CHF', weight: 0.5, invert: true },
    ],
  },
  {
    name: 'COMMODITY-FX',
    description: 'Commodity currency bloc (AUD+CAD+NZD vs USD)',
    legs: [
      { pair: 'AUD_USD', weight: 0.34 },
      { pair: 'NZD_USD', weight: 0.33 },
      { pair: 'USD_CAD', weight: 0.33, invert: true },
    ],
  },
  {
    name: 'EUR-CROSS',
    description: 'EUR relative strength vs GBP+CHF',
    legs: [
      { pair: 'EUR_GBP', weight: 0.5 },
      { pair: 'EUR_CHF', weight: 0.5 },
    ],
  },
];

/**
 * Calculate synthetic pair value from live prices
 * @param basket The synthetic pair definition
 * @param prices Map of pair -> mid price (e.g. { "EUR_USD": 1.0850, "GBP_USD": 1.2650 })
 * @returns The synthetic quote or null if prices missing
 */
export function calculateSyntheticValue(
  basket: SyntheticPair,
  prices: Record<string, number>,
  previousValue?: number,
): SyntheticQuote | null {
  const legs: SyntheticQuote['legs'] = [];
  let totalValue = 0;

  for (const leg of basket.legs) {
    const price = prices[leg.pair];
    if (price == null) return null;

    const effectivePrice = leg.invert ? 1 / price : price;
    const contribution = effectivePrice * leg.weight;
    totalValue += contribution;

    legs.push({
      pair: leg.pair,
      price,
      weight: leg.weight,
      contribution: Math.round(contribution * 100000) / 100000,
    });
  }

  const value = Math.round(totalValue * 100000) / 100000;
  const change = previousValue != null ? Math.round((value - previousValue) * 100000) / 100000 : 0;
  const changePct = previousValue != null && previousValue !== 0
    ? Math.round((change / previousValue) * 10000) / 100
    : 0;

  return {
    name: basket.name,
    value,
    change,
    changePct,
    legs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse a basket definition string like "[0.5*EUR_USD + 0.5*GBP_USD]"
 */
export function parseSyntheticDefinition(defStr: string, name: string): SyntheticPair | null {
  try {
    const cleaned = defStr.replace(/[\[\]]/g, '').trim();
    const parts = cleaned.split('+').map(s => s.trim());
    const legs: SyntheticLeg[] = [];

    for (const part of parts) {
      const match = part.match(/^(-?)(\d*\.?\d+)\s*\*\s*(\w+)$/);
      if (!match) return null;
      const [, neg, weightStr, pair] = match;
      legs.push({
        pair,
        weight: parseFloat(weightStr),
        invert: neg === '-',
      });
    }

    if (legs.length === 0) return null;
    return { name, legs };
  } catch {
    return null;
  }
}
