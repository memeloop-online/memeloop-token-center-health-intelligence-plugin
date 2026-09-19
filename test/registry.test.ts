import { describe, expect, it } from 'vitest';
import { SnapshotService } from '../src/server/fetcher.js';
import { createSourceRegistry, SOURCE_REGISTRY, type SourceSpec } from '../src/server/sources.js';
import { decodeSnapshot } from '../src/server/decodeSnapshot.js';
import { fixtureFetch, fixedNow } from './testUtils.js';
import { MAX_SOURCES, MAX_ROWS, MAX_CLOCK_SKEW_MS } from '../src/shared/limits.js';

const extra: SourceSpec = {
  source: 'community-benchmark', label: 'Community benchmark',
  pageUrl: 'https://benchmark.community/', endpoint: 'https://benchmark.community/data.json',
  robotsUrl: 'https://benchmark.community/robots.txt', dataPath: '/data.json',
  maxObservationAgeSeconds: 86400,
  normalize: () => ({ sourceUpdatedAt: fixedNow().toISOString(), rows: [{ key: 'model-a', model: 'Model A', score: 82 }] }),
};

describe('source extensions and snapshot freshness', () => {
  it('collects and decodes a fourth source through the same pipeline', async () => {
    const fixtures = fixtureFetch();
    const service = new SnapshotService({
      sources: [...SOURCE_REGISTRY.values(), extra], now: fixedNow,
      fetch: (url, init) => String(url).startsWith('https://benchmark.community/')
        ? Promise.resolve(new Response(String(url).endsWith('robots.txt') ? '' : '{}'))
        : fixtures.fetch(url, init),
    });
    const result = decodeSnapshot(await service.read(), fixedNow().getTime());
    expect(result.sources.map((source) => source.id)).toEqual(['codexradar', 'deepswe', 'aixhan', extra.source]);
    expect(result.sources[3]?.rows[0]).toMatchObject({ model: 'Model A', score: 82 });
  });

  it('rejects ambiguous source IDs and cross-origin endpoints', () => {
    expect(() => createSourceRegistry([extra, extra])).toThrow();
    expect(() => createSourceRegistry([{ ...extra, endpoint: 'https://another.community/data.json' }])).toThrow();
  });

  it('ages a published snapshot from absolute timestamps at read time', async () => {
    const snapshot = await new SnapshotService({ now: fixedNow, fetch: fixtureFetch().fetch }).read();
    const later = decodeSnapshot(snapshot, fixedNow().getTime() + 21 * 60_000);
    expect(later.sources.every((source) => source.status === 'stale')).toBe(true);
    expect(later.sources[0]?.fetchedAt).toBe(snapshot.sources[0]?.fetchedAt);
  });

  it('marks old observations stale even when their endpoint is freshly fetched', async () => {
    const snapshot = await new SnapshotService({
      now: fixedNow, sources: [{ ...extra, maxObservationAgeSeconds: 60,
        normalize: () => ({ sourceUpdatedAt: '2026-09-06T00:00:00.000Z', rows: [] }) }],
      fetch: async () => new Response('{}'),
    }).read();
    expect(snapshot.sources[0]?.status).toBe('stale');
  });

  it('applies the row cap and scalar validation to every registered normalizer', async () => {
    const service = (rows: unknown) => new SnapshotService({ now: fixedNow,
      sources: [{ ...extra, normalize: () => ({ sourceUpdatedAt: null, rows: rows as never }) }],
      fetch: async () => new Response('{}') });
    const capped = await service(Array.from({ length: MAX_ROWS + 10 }, (_, index) => ({ key: `${index}`, score: index }))).read();
    expect(capped.sources[0]?.rows).toHaveLength(MAX_ROWS);
    const malformed = await service([{ key: 'invalid', nested: { payload: 'raw data' } }]).read();
    expect(malformed.sources[0]?.status).toBe('error');
    expect(malformed.sources[0]?.rows).toEqual([]);
  });

  it('rejects oversized source lists and unsafe source links at snapshot decode', async () => {
    const snapshot = await new SnapshotService({ now: fixedNow, fetch: fixtureFetch().fetch }).read();
    expect(() => decodeSnapshot({ ...snapshot, sources: Array(MAX_SOURCES + 1).fill(snapshot.sources[0]) }, fixedNow().getTime())).toThrow();
    for (const pageUrl of ['javascript:alert(1)', 'https://user@host.test/', 'https://host.test/?x=1', 'https://host.test/#x']) {
      expect(() => decodeSnapshot({ ...snapshot, sources: [{ ...snapshot.sources[0], pageUrl }] }, fixedNow().getTime())).toThrow();
    }
  });

  it('rejects future snapshot clocks and marks future source timestamps stale', async () => {
    const now = fixedNow().getTime();
    const snapshot = await new SnapshotService({ now: fixedNow, fetch: fixtureFetch().fetch }).read();
    const future = new Date(now + MAX_CLOCK_SKEW_MS + 1).toISOString();
    expect(() => decodeSnapshot({ ...snapshot, generatedAt: future }, now)).toThrow();
    for (const field of ['fetchedAt', 'sourceUpdatedAt']) {
      const result = decodeSnapshot({ ...snapshot, sources: [{ ...snapshot.sources[0], [field]: future }] }, now);
      expect(result.sources[0]?.status).toBe('stale');
    }
  });
});
