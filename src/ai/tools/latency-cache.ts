const MAX_LATENCY_ENTRIES = 500;

const latencyByKey = new Map<string, number>();

type LatencyStats = {
  totalEntries: number;
  byPrefix: Record<
    string,
    {
      count: number;
      min: number | null;
      max: number | null;
      avg: number | null;
    }
  >;
};

export function getLastLatencyMs(key: string): number | undefined {
  return latencyByKey.get(key);
}

export function setLastLatencyMs(key: string, latencyMs: number) {
  if (!Number.isFinite(latencyMs)) return;
  latencyByKey.set(key, Math.max(0, Math.round(latencyMs)));

  if (latencyByKey.size <= MAX_LATENCY_ENTRIES) return;

  const oldestKey = latencyByKey.keys().next().value;
  if (oldestKey) {
    latencyByKey.delete(oldestKey);
  }
}

export function getLatencyStats(): LatencyStats {
  const byPrefix: LatencyStats['byPrefix'] = {};

  latencyByKey.forEach((latencyMs, key) => {
    const prefix = key.split(':')[0] || 'unknown';
    if (!byPrefix[prefix]) {
      byPrefix[prefix] = { count: 0, min: null, max: null, avg: null };
    }
    const bucket = byPrefix[prefix];
    bucket.count += 1;
    bucket.min =
      bucket.min === null ? latencyMs : Math.min(bucket.min, latencyMs);
    bucket.max =
      bucket.max === null ? latencyMs : Math.max(bucket.max, latencyMs);
    bucket.avg =
      bucket.avg === null
        ? latencyMs
        : Math.round(
            (bucket.avg * (bucket.count - 1) + latencyMs) / bucket.count
          );
  });

  return {
    totalEntries: latencyByKey.size,
    byPrefix,
  };
}
