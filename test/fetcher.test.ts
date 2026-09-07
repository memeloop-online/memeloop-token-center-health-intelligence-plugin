import { describe, expect, it } from 'vitest';
import { SnapshotService, SourceFetchError } from '../src/server/fetcher.js';
import { assertExactAllowedOrigin, parseRobots } from '../src/server/security.js';
import { fixture, fixtureFetch, fixtureText, fixedNow } from './testUtils.js';

const noWait = async () => undefined;
const policy = { timeoutMs: 250, retryDelayMs: [0, 0] as const };

describe('bounded public source collection', () => {
  it('fetches all reviewed endpoints and returns no raw upstream payload', async () => {
    const setup = fixtureFetch();
    const service = new SnapshotService({ fetch: setup.fetch, now: fixedNow, sleep: noWait, policy });
    const snapshot = await service.read();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.sources.map((source) => source.status)).toEqual(['ok', 'ok', 'ok']);
    expect(setup.calls).toHaveLength(6);
    expect(JSON.stringify(snapshot)).not.toContain('comprehensive_points');
    expect(JSON.stringify(snapshot)).not.toContain('providerTimelines');
    expect(JSON.stringify(snapshot)).not.toContain('access_token');
  });

  it('uses the bounded cache until an explicit refresh', async () => {
    const setup = fixtureFetch();
    const service = new SnapshotService({ fetch: setup.fetch, now: fixedNow, sleep: noWait, policy });
    await service.read();
    const before = setup.calls.length;
    await service.read();
    expect(setup.calls).toHaveLength(before);
    await service.read(true);
    expect(setup.calls.length).toBeGreaterThan(before);
  });

  it('keeps successful sources visible when one source fails', async () => {
    const setup = fixtureFetch(undefined, undefined, { deepswe: 503 });
    const service = new SnapshotService({ fetch: setup.fetch, now: fixedNow, sleep: noWait, policy });
    const snapshot = await service.read();
    expect(snapshot.sources[0]?.status).toBe('ok');
    expect(snapshot.sources[1]?.status).toBe('error');
    expect(snapshot.sources[1]?.error).toContain('HTTP 503');
    expect(snapshot.sources[2]?.status).toBe('ok');
  });

  it('serves stale typed data after a refresh failure', async () => {
    let failData = false;
    const setup = fixtureFetch();
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (failData && url.endsWith('/api/radar-insights')) return new Response('failure', { status: 503 });
      return setup.fetch(url, init);
    };
    const service = new SnapshotService({ fetch, now: fixedNow, sleep: noWait, policy });
    await service.read();
    failData = true;
    const snapshot = await service.read(true);
    expect(snapshot.sources[0]?.status).toBe('stale');
    expect(snapshot.sources[0]?.error).toContain('HTTP 503');
    expect(snapshot.sources[0]?.rows.length).toBeGreaterThan(0);
  });

  it('retries transient status and stops at the configured attempt bound', async () => {
    let attempts = 0;
    const fetch = async () => {
      attempts += 1;
      return new Response('{}', { status: 503 });
    };
    const service = new SnapshotService({ fetch, now: fixedNow, sleep: noWait, policy: { ...policy, retries: 2 } });
    const snapshot = await service.read();
    expect(snapshot.sources.every((source) => source.status === 'error')).toBe(true);
    // Each of three robots requests is retried twice; data is never reached.
    expect(attempts).toBe(9);
  });

  it('enforces a response body cap before normalization', async () => {
    const fetch = async () => new Response('x'.repeat(2_048), { status: 200, headers: { 'content-type': 'application/json' } });
    const service = new SnapshotService({ fetch, now: fixedNow, sleep: noWait, policy: { ...policy, bodyCapBytes: 1_024 } });
    const snapshot = await service.read();
    expect(snapshot.sources.every((source) => source.status === 'error')).toBe(true);
    expect(snapshot.sources.every((source) => source.error?.includes('body limit'))).toBe(true);
  });

  it('honors a wildcard robots disallow and never calls that data endpoint', async () => {
    const setup = fixtureFetch(undefined, fixtureText('robots/disallow-data.txt'));
    const service = new SnapshotService({ fetch: setup.fetch, now: fixedNow, sleep: noWait, policy });
    const snapshot = await service.read();
    expect(snapshot.sources.every((source) => source.status === 'error')).toBe(true);
    expect(snapshot.sources.every((source) => source.error).valueOf()).toBe(true);
    expect(setup.calls.every((url) => url.endsWith('/robots.txt'))).toBe(true);
  });

  it('fails closed when a robots policy is unavailable', async () => {
    const fetch = async (input: string | URL) => {
      const url = String(input);
      return url.endsWith('/robots.txt') ? new Response('upstream', { status: 503 }) : new Response('{}', { status: 200 });
    };
    const service = new SnapshotService({ fetch, now: fixedNow, sleep: noWait, policy });
    const snapshot = await service.read();
    expect(snapshot.sources.every((source) => source.error?.includes('robots policy'))).toBe(true);
  });
});

describe('SSRF and robots helpers', () => {
  it('allows only exact reviewed origins', () => {
    expect(() => assertExactAllowedOrigin('https://codexradar.com/api/radar-insights')).not.toThrow();
    expect(() => assertExactAllowedOrigin('https://codexradar.com.evil.example/api/radar-insights')).toThrow();
    expect(() => assertExactAllowedOrigin('http://codexradar.com/api/radar-insights')).toThrow();
    expect(() => assertExactAllowedOrigin('https://codexradar.com@evil.example/api/radar-insights')).toThrow();
    expect(() => assertExactAllowedOrigin('https://codexradar.com/api/radar-insights?refresh=1')).toThrow();
  });

  it('applies the longest robots path rule, with Allow winning ties', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /api/\nAllow: /api/radar-insights\n', 'https://codexradar.com/robots.txt', '/api/radar-insights');
    expect(rules.allowed).toBe(true);
    expect(parseRobots('User-agent: *\nDisallow: /api/\n', 'https://codexradar.com/robots.txt', '/api/radar-insights').allowed).toBe(false);
    expect(parseRobots('User-agent: Googlebot\nUser-agent: *\nDisallow: /api/\n', 'https://codexradar.com/robots.txt', '/api/radar-insights').allowed).toBe(false);
  });

  it('classifies bounded HTTP failures without exposing response body text', async () => {
    const fetch = async () => new Response('secret upstream error', { status: 503 });
    await expect(new SnapshotService({ fetch, now: fixedNow, sleep: noWait, policy }).read()).resolves.toBeDefined();
    expect(new SourceFetchError('http_5xx', 'public source returned HTTP 503', true).message).not.toContain('secret');
  });
});
