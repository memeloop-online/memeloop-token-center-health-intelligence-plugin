import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createHealthIntelligenceServer } from '../src/server/httpServer.js';
import { SnapshotService } from '../src/server/fetcher.js';
import { fixtureFetch, fixedNow } from './testUtils.js';

describe('host HTTP adapter', () => {
  it('exposes one typed read-only JSON route', async () => {
    const setup = fixtureFetch();
    const snapshotService = new SnapshotService({ fetch: setup.fetch, now: fixedNow, sleep: async () => undefined, policy: { timeoutMs: 250, retryDelayMs: [0, 0] } });
    const server = createHealthIntelligenceServer({ snapshotService });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health-intelligence`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect((await response.json() as { sources: unknown[] }).sources).toHaveLength(3);
      expect(await fetch(`http://127.0.0.1:${address.port}/api/health-intelligence?target=https://evil.example`)).toMatchObject({ status: 404 });
      expect(await fetch(`http://127.0.0.1:${address.port}/api/health-intelligence`, { method: 'POST' })).toMatchObject({ status: 404 });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
