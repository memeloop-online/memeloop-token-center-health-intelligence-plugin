import { describe, expect, it } from 'vitest';
import { SnapshotService } from '../src/server/fetcher.js';
import { createSourceRegistry, SOURCE_REGISTRY, type SourceSpec } from '../src/server/sources.js';
import { decodeSnapshot } from '../src/server/decodeSnapshot.js';
import { fixtureFetch, fixedNow } from './testUtils.js';

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
});
