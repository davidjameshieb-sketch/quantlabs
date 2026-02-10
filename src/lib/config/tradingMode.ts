// ─── Global Trading Mode Configuration ───
// Single source of truth for Long-Only mode enforcement.
// Priority: env var FOREX_LONG_ONLY=true > UI toggle > default (NORMAL)

export type TradingMode = 'NORMAL' | 'LONG_ONLY';

// ─── In-memory UI toggle (persisted to localStorage) ───
const STORAGE_KEY = 'quantlabs_trading_mode';
const SHADOW_SHORTS_KEY = 'quantlabs_shadow_shorts_enabled';

function getStoredMode(): TradingMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'LONG_ONLY') return 'LONG_ONLY';
  } catch { /* SSR / edge function safe */ }
  return 'NORMAL';
}

// ─── Public API ───

/**
 * Returns true if Long-Only mode is active.
 * Priority: env var > localStorage toggle > default (false)
 */
export function isLongOnlyEnabled(): boolean {
  // Env var override (highest priority — safety)
  try {
    const envVal = import.meta.env.VITE_FOREX_LONG_ONLY;
    if (envVal === 'true' || envVal === '1') return true;
    if (envVal === 'false' || envVal === '0') return false;
  } catch { /* edge function — no import.meta.env */ }

  return getStoredMode() === 'LONG_ONLY';
}

/**
 * Get the current trading mode label.
 */
export function getTradingMode(): TradingMode {
  return isLongOnlyEnabled() ? 'LONG_ONLY' : 'NORMAL';
}

/**
 * Set trading mode via UI toggle (stored in localStorage).
 */
export function setTradingMode(mode: TradingMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* SSR safe */ }
  console.log(`[TRADING_MODE] Set to ${mode}`);
}

/**
 * Whether shadow-evaluation of blocked shorts is enabled.
 */
export function isShadowShortsEnabled(): boolean {
  try {
    return localStorage.getItem(SHADOW_SHORTS_KEY) === 'true';
  } catch { return false; }
}

export function setShadowShortsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SHADOW_SHORTS_KEY, String(enabled));
  } catch { /* SSR safe */ }
}

/**
 * Check if the Long-Only mode is forced by env var (cannot be toggled off).
 */
export function isLongOnlyForcedByEnv(): boolean {
  try {
    const envVal = import.meta.env.VITE_FOREX_LONG_ONLY;
    return envVal === 'true' || envVal === '1';
  } catch { return false; }
}
