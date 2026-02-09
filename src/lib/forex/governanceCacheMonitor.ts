// Governance Cache Performance Monitor — Section 8
// Tracks slow/fast cache hit rates and context retrieval latency.
// Read-only monitoring — does NOT modify cache behavior.

import { governanceAlerts } from './governanceAlerts';

// ─── Metrics Store ───

interface CacheMetrics {
  slowHits: number;
  slowMisses: number;
  fastHits: number;
  fastMisses: number;
  totalRetrievals: number;
  totalLatencyMs: number;
}

const metrics: CacheMetrics = {
  slowHits: 0,
  slowMisses: 0,
  fastHits: 0,
  fastMisses: 0,
  totalRetrievals: 0,
  totalLatencyMs: 0,
};

let STALE_FAST_CACHE_THRESHOLD = 0.95;

export function setStaleFastCacheThreshold(threshold: number): void {
  STALE_FAST_CACHE_THRESHOLD = Math.max(0, Math.min(1, threshold));
}

// ─── Recording Functions (called from governanceContextProvider) ───

export function recordSlowCacheHit(): void {
  metrics.slowHits++;
}

export function recordSlowCacheMiss(): void {
  metrics.slowMisses++;
}

export function recordFastCacheHit(): void {
  metrics.fastHits++;
}

export function recordFastCacheMiss(): void {
  metrics.fastMisses++;
}

export function recordContextRetrieval(latencyMs: number): void {
  metrics.totalRetrievals++;
  metrics.totalLatencyMs += latencyMs;
}

// ─── Query Interface ───

export interface CachePerformanceStats {
  slowCacheHitRate: number;
  fastCacheHitRate: number;
  avgContextLatencyMs: number;
  totalRetrievals: number;
  staleFastCacheAlert: boolean;
}

export function computeCachePerformance(): CachePerformanceStats {
  const slowTotal = metrics.slowHits + metrics.slowMisses;
  const fastTotal = metrics.fastHits + metrics.fastMisses;

  const slowCacheHitRate = slowTotal > 0 ? metrics.slowHits / slowTotal : 0;
  const fastCacheHitRate = fastTotal > 0 ? metrics.fastHits / fastTotal : 0;
  const avgContextLatencyMs = metrics.totalRetrievals > 0
    ? metrics.totalLatencyMs / metrics.totalRetrievals
    : 0;

  const staleFastCacheAlert = fastCacheHitRate > STALE_FAST_CACHE_THRESHOLD && fastTotal > 20;

  if (staleFastCacheAlert) {
    governanceAlerts.emit('stale_fast_cache', {
      fastCacheHitRate,
      threshold: STALE_FAST_CACHE_THRESHOLD,
    });
  }

  return {
    slowCacheHitRate,
    fastCacheHitRate,
    avgContextLatencyMs,
    totalRetrievals: metrics.totalRetrievals,
    staleFastCacheAlert,
  };
}

export function resetCacheMetrics(): void {
  metrics.slowHits = 0;
  metrics.slowMisses = 0;
  metrics.fastHits = 0;
  metrics.fastMisses = 0;
  metrics.totalRetrievals = 0;
  metrics.totalLatencyMs = 0;
}
