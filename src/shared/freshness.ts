import type { SourceSnapshot } from './types.js';

/** Re-evaluate absolute timestamps whenever a stored snapshot is consumed. */
export function refreshSourceStatus(source: SourceSnapshot, now = Date.now()): SourceSnapshot {
  const fetched = Date.parse(source.fetchedAt);
  const observed = source.sourceUpdatedAt === null ? fetched : Date.parse(source.sourceUpdatedAt);
  const expired = !Number.isFinite(fetched) || !Number.isFinite(observed)
    || now - fetched > 20 * 60_000
    || now - observed > source.maxObservationAgeSeconds * 1000;
  return { ...source, status: source.status === 'ok' && expired ? 'stale' : source.status };
}
