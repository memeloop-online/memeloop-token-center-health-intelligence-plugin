import { describe, expect, it } from 'vitest';
import { createRuntimeCollector, runtimeSources, type RuntimeSource } from '../src/server/runtimeContract.js';
import { SnapshotService } from '../src/server/fetcher.js';
import { SOURCE_SPECS } from '../src/server/sources.js';
import { fixtureFetch, fixedNow } from './testUtils.js';

const source: RuntimeSource = {
  source: 'configured-radar', label: 'Configured radar', normalizer: 'codexradar_v1',
  pageUrl: 'https://codexradar.com/', endpoint: 'https://codexradar.com/api/radar-insights',
  robotsUrl: 'https://codexradar.com/robots.txt', dataPath: '/api/radar-insights',
  maxObservationAgeSeconds: 86400,
};
const authority = { pluginId: 'mtc-health-intelligence', endpointId: 'health-intelligence',
  allowedOrigins: ['https://codexradar.com'] } as const;

describe('service-data runtime contract', () => {
  it('collects only configured sources without a built-in three-source fallback', async () => {
    const fixtures = fixtureFetch();
    const result = await createRuntimeCollector({ sources: [source] }, authority, fixtures.fetch).read();
    expect(result.sources.map((value) => value.id)).toEqual(['configured-radar']);
    expect(result.sources[0]?.rows.length).toBeGreaterThan(0);
    expect(() => runtimeSources({ sources: [] }, authority)).toThrow();
  });

  it('cannot expand the signed authority through source configuration', () => {
    expect(() => runtimeSources({ sources: [source] }, { ...authority, allowedOrigins: [] })).toThrow();
    expect(() => runtimeSources({ sources: [{ ...source, normalizer: 'constructor' as never }] }, authority)).toThrow();
    expect(() => runtimeSources({ sources: [{ ...source, robotsUrl: 'https://other.test/robots.txt' }] }, authority)).toThrow();
    expect(() => runtimeSources({ sources: [source] }, { ...authority, pluginId: 'other' as never })).toThrow();
  });

  it('isolates last-good data and failures between collector instances', async () => {
    const first = createRuntimeCollector({ sources: [source] }, authority, fixtureFetch().fetch);
    expect((await first.read()).sources[0]?.rows.length).toBeGreaterThan(0);
    const second = createRuntimeCollector({ sources: [source] }, authority, async () => { throw new Error('private detail'); });
    const result = await second.read();
    expect(result.sources[0]?.status).toBe('error');
    expect(result.sources[0]?.rows).toEqual([]);
    expect(result.sources[0]?.error).not.toContain('private detail');
  });

  it('negative-caches a failure even on forced reads, then retries without refreshing last-good timestamps', async () => {
    let clock = fixedNow().getTime();
    let failing = false;
    let calls = 0;
    const fixtures = fixtureFetch();
    const service = new SnapshotService({ sources: [SOURCE_SPECS.codexradar!],
      now: () => new Date(clock), failureCacheTtlMs: 30_000, policy: { retries: 0 },
      fetch: async (url, init) => { calls += 1; if (failing) throw new Error('failure'); return fixtures.fetch(url, init); },
    });
    const good = (await service.read()).sources[0]!;
    failing = true;
    clock += 301_000;
    const failed = (await service.read()).sources[0]!;
    const failureCalls = calls;
    expect(failed.status).toBe('stale');
    expect(failed.fetchedAt).toBe(good.fetchedAt);
    await service.read(true);
    expect(calls).toBe(failureCalls);
    clock += 30_000;
    await service.read();
    expect(calls).toBeGreaterThan(failureCalls);
  });
});
