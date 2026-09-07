import { describe, expect, it } from 'vitest';
import { decodeSnapshot, fetchSnapshot } from '../src/client/api.js';
import type { HealthIntelligenceSnapshot } from '../src/shared/types.js';
import { fixtureFetch, fixedNow } from './testUtils.js';

function snapshot(): HealthIntelligenceSnapshot {
  const setup = fixtureFetch();
  const now = fixedNow().toISOString();
  return {
    schemaVersion: 1,
    generatedAt: now,
    sources: [
      { id: 'codexradar', label: 'Codex Radar', pageUrl: 'https://codexradar.com/', endpoint: 'https://codexradar.com/api/radar-insights', status: 'ok', fetchedAt: now, sourceUpdatedAt: now, ageSeconds: 0, attempts: 1, error: null, rows: [] },
      { id: 'deepswe', label: 'DeepSWE', pageUrl: 'https://deepswe.datacurve.ai/', endpoint: 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json', status: 'ok', fetchedAt: now, sourceUpdatedAt: now, ageSeconds: 0, attempts: 1, error: null, rows: [] },
      { id: 'aixhan', label: 'AixHan model health', pageUrl: 'https://cdk.aixhan.com/model-health', endpoint: 'https://cdk.aixhan.com/api/public/check-cx/dashboard', status: 'ok', fetchedAt: now, sourceUpdatedAt: now, ageSeconds: 0, attempts: 1, error: null, rows: [] },
    ],
  };
}

describe('typed browser adapter', () => {
  it('rejects unknown or incomplete response data', () => {
    expect(() => decodeSnapshot({ schemaVersion: 1, sources: [] })).toThrow();
    expect(() => decodeSnapshot({ ...snapshot(), sources: [{ ...snapshot().sources[0], rows: [{ html: '<iframe>' }] }, ...snapshot().sources.slice(1)] })).toThrow();
  });

  it('requests only the local API and omits credentials', async () => {
    const value = snapshot();
    const calls: Array<{ input: string | URL | Request; init?: RequestInit | undefined }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await expect(fetchSnapshot(false, fetcher)).resolves.toMatchObject({ schemaVersion: 1 });
    expect(calls[0]?.input).toBe('/api/health-intelligence');
    expect(calls[0]?.init?.credentials).toBe('omit');
    expect(calls[0]?.init?.redirect).toBe('error');
  });
});
