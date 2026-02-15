// Forex pricing utilities — base prices and realistic price generation

import { ForexRNG } from './forexRng';
import { getLivePrice } from './oandaPricingService';

// ─── Realistic Forex Base Prices ───

export const FOREX_BASE_PRICES: Record<string, number> = {
  'EUR/USD': 1.1817, 'GBP/USD': 1.3612, 'USD/JPY': 157.24, 'AUD/USD': 0.7013,
  'USD/CAD': 1.3674, 'NZD/USD': 0.6016, 'EUR/GBP': 0.8681, 'EUR/JPY': 185.81,
  'GBP/JPY': 214.03, 'AUD/JPY': 110.29, 'USD/CHF': 0.7757, 'EUR/CHF': 0.9168,
  'EUR/AUD': 1.6849, 'GBP/AUD': 1.9408, 'AUD/NZD': 1.1658, 'USD/SGD': 1.2712,
  'USD/HKD': 7.8136, 'USD/MXN': 17.2675, 'USD/ZAR': 16.0414, 'EUR/NZD': 1.9642,
  'GBP/NZD': 2.2626, 'GBP/CAD': 1.8616, 'EUR/CAD': 1.6159, 'AUD/CAD': 0.9590,
  'NZD/CAD': 0.8226, 'CHF/JPY': 202.70, 'CAD/JPY': 114.99, 'NZD/JPY': 94.59,
  'CAD/CHF': 0.5673, 'AUD/CHF': 0.5440,
};

export function toDisplaySymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  if (symbol.length === 6) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  if (symbol.length === 7) return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return symbol;
}

export function getRealisticPrice(symbol: string, rng: ForexRNG): number {
  const displaySymbol = toDisplaySymbol(symbol);
  const livePrice = getLivePrice(displaySymbol);
  if (livePrice) {
    const deviation = rng.range(-0.003, 0.003);
    return livePrice * (1 + deviation);
  }
  const base = FOREX_BASE_PRICES[displaySymbol];
  if (base) {
    const deviation = rng.range(-0.003, 0.003);
    return base * (1 + deviation);
  }
  return displaySymbol.includes('JPY') ? rng.range(80, 195) : rng.range(0.55, 1.85);
}
