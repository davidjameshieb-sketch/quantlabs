// Governance Alerting System — Section 12
// Configurable alert thresholds with console warning emission.
// Read-only: does NOT modify trading decisions or execution flow.

export type GovernanceAlertType =
  | 'neutral_rate_spike'
  | 'gate_trigger_imbalance'
  | 'data_availability_degradation'
  | 'unit_consistency_failure'
  | 'shadow_mode_execution_violation'
  | 'symbol_mapping_failure'
  | 'stale_fast_cache';

export interface GovernanceAlert {
  type: GovernanceAlertType;
  timestamp: number;
  details: Record<string, unknown>;
}

const MAX_ALERTS = 500;
let alertHistory: GovernanceAlert[] = [];

class GovernanceAlertEmitter {
  emit(type: GovernanceAlertType, details: Record<string, unknown>): void {
    const alert: GovernanceAlert = {
      type,
      timestamp: Date.now(),
      details,
    };

    alertHistory.push(alert);
    if (alertHistory.length > MAX_ALERTS) {
      alertHistory = alertHistory.slice(-MAX_ALERTS);
    }

    console.warn(`[GOV-ALERT] ${type}:`, JSON.stringify(details));
  }

  getAlerts(type?: GovernanceAlertType, sinceMs?: number): GovernanceAlert[] {
    let result = alertHistory;
    if (type) result = result.filter(a => a.type === type);
    if (sinceMs) {
      const cutoff = Date.now() - sinceMs;
      result = result.filter(a => a.timestamp >= cutoff);
    }
    return result;
  }

  getRecentAlerts(count: number = 20): GovernanceAlert[] {
    return alertHistory.slice(-count);
  }

  clearAlerts(): void {
    alertHistory = [];
  }

  getAlertCounts(sinceMs?: number): Record<GovernanceAlertType, number> {
    const alerts = sinceMs
      ? alertHistory.filter(a => a.timestamp >= Date.now() - sinceMs)
      : alertHistory;

    const counts = {} as Record<GovernanceAlertType, number>;
    for (const a of alerts) {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
    return counts;
  }
}

export const governanceAlerts = new GovernanceAlertEmitter();
