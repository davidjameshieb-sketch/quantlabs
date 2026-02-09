// Forex Symbol Normalization Utility
// Single canonical mapping used across governance, pricing, and UI.

export interface ForexSymbolInfo {
  canonical: string;   // e.g. "EUR_USD" — OANDA/broker format
  display: string;     // e.g. "EUR/USD" — UI / ticker registry
  raw: string;         // e.g. "EURUSD" — compact 6-char
}

/**
 * Normalize any forex symbol format into canonical forms.
 * Accepts: "EURUSD", "EUR/USD", "EUR_USD"
 */
export function normalizeForexSymbol(symbol: string): ForexSymbolInfo {
  // Strip whitespace
  const s = symbol.trim();

  let base: string;
  let quote: string;

  if (s.includes('/')) {
    [base, quote] = s.split('/');
  } else if (s.includes('_')) {
    [base, quote] = s.split('_');
  } else if (s.length === 6) {
    base = s.slice(0, 3);
    quote = s.slice(3);
  } else if (s.length === 7 && s[3] === '/') {
    base = s.slice(0, 3);
    quote = s.slice(4);
  } else {
    // Fallback: treat as-is
    base = s.slice(0, 3);
    quote = s.slice(3, 6) || 'XXX';
  }

  base = base.toUpperCase();
  quote = quote.toUpperCase();

  return {
    canonical: `${base}_${quote}`,
    display: `${base}/${quote}`,
    raw: `${base}${quote}`,
  };
}

/**
 * Convert any symbol to display format (EUR/USD)
 */
export function toDisplaySymbol(symbol: string): string {
  return normalizeForexSymbol(symbol).display;
}

/**
 * Convert any symbol to canonical format (EUR_USD) for broker APIs
 */
export function toCanonicalSymbol(symbol: string): string {
  return normalizeForexSymbol(symbol).canonical;
}

/**
 * Convert any symbol to raw format (EURUSD)
 */
export function toRawSymbol(symbol: string): string {
  return normalizeForexSymbol(symbol).raw;
}
