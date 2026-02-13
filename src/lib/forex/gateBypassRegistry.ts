// Gate Bypass Registry — Runtime overrides from the AI Floor Manager
// Every bypass is logged for forensic accountability.

import type { GateId } from './tradeGovernanceEngine';

export interface GateBypass {
  gateId: GateId;
  reason: string;
  bypassedAt: number;
  expiresAt: number;
  pair?: string;           // optional: restrict bypass to a specific pair
}

export interface GateBypassAuditEntry extends GateBypass {
  usedAt: number;
  tradeSignalId?: string;
}

// ─── In-Memory Registry ───

const activeBypassMap = new Map<string, GateBypass>();
const auditLog: GateBypassAuditEntry[] = [];
const MAX_AUDIT_LOG = 200;

function bypassKey(gateId: GateId, pair?: string): string {
  return pair ? `${gateId}:${pair}` : gateId;
}

// ─── Public API ───

/** Register a gate bypass with an auto-expiry (default 15 minutes). */
export function registerBypass(
  gateId: GateId,
  reason: string,
  ttlMs: number = 15 * 60 * 1000,
  pair?: string,
): void {
  const now = Date.now();
  const key = bypassKey(gateId, pair);
  activeBypassMap.set(key, {
    gateId,
    reason,
    bypassedAt: now,
    expiresAt: now + ttlMs,
    pair,
  });
  console.warn(
    `[GATE-BYPASS] ⚡ ${gateId} BYPASSED${pair ? ` for ${pair}` : ''} — reason: ${reason} — expires in ${Math.round(ttlMs / 60000)}m`,
  );
}

/** Remove a specific bypass early. */
export function revokeBypass(gateId: GateId, pair?: string): boolean {
  const key = bypassKey(gateId, pair);
  const existed = activeBypassMap.delete(key);
  if (existed) {
    console.warn(`[GATE-BYPASS] ❌ ${gateId} bypass REVOKED${pair ? ` for ${pair}` : ''}`);
  }
  return existed;
}

/** Check if a gate is currently bypassed for a given pair. Records audit entry if used. */
export function isGateBypassed(gateId: GateId, pair?: string, signalId?: string): boolean {
  const now = Date.now();

  // Check pair-specific bypass first, then global
  const pairKey = pair ? bypassKey(gateId, pair) : null;
  const globalKey = bypassKey(gateId);

  for (const key of [pairKey, globalKey]) {
    if (!key) continue;
    const bypass = activeBypassMap.get(key);
    if (!bypass) continue;

    // Expired?
    if (now > bypass.expiresAt) {
      activeBypassMap.delete(key);
      console.warn(`[GATE-BYPASS] ⏰ ${gateId} bypass EXPIRED`);
      continue;
    }

    // Record audit
    const entry: GateBypassAuditEntry = {
      ...bypass,
      usedAt: now,
      tradeSignalId: signalId,
    };
    auditLog.push(entry);
    if (auditLog.length > MAX_AUDIT_LOG) auditLog.shift();

    console.warn(
      `[GATE-BYPASS] ✅ ${gateId} BYPASSED for trade${pair ? ` on ${pair}` : ''} — reason: ${bypass.reason}`,
    );
    return true;
  }

  return false;
}

/** Get all currently active bypasses. */
export function getActiveBypasses(): GateBypass[] {
  const now = Date.now();
  const result: GateBypass[] = [];
  for (const [key, bypass] of activeBypassMap.entries()) {
    if (now > bypass.expiresAt) {
      activeBypassMap.delete(key);
    } else {
      result.push(bypass);
    }
  }
  return result;
}

/** Get the full audit log for forensic review. */
export function getBypassAuditLog(): GateBypassAuditEntry[] {
  return [...auditLog];
}

/** Clear all active bypasses (emergency reset). */
export function clearAllBypasses(): void {
  const count = activeBypassMap.size;
  activeBypassMap.clear();
  console.warn(`[GATE-BYPASS] 🔒 ALL BYPASSES CLEARED (${count} removed)`);
}
