import type {
  AixHanRow,
  AixHanSnapshot,
  CodexRadarRow,
  CodexRadarSnapshot,
  DeepSweRow,
  DeepSweSnapshot,
  HealthIntelligenceSnapshot,
  SourceId,
  SourceSnapshot,
} from '../shared/types.js';

export const HEALTH_INTELLIGENCE_API = '/api/health-intelligence';

const PUBLIC_SOURCE_METADATA = {
  codexradar: {
    pageUrl: 'https://codexradar.com/',
    endpoint: 'https://codexradar.com/api/radar-insights',
  },
  deepswe: {
    pageUrl: 'https://deepswe.datacurve.ai/',
    endpoint: 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json',
  },
  aixhan: {
    pageUrl: 'https://cdk.aixhan.com/model-health',
    endpoint: 'https://cdk.aixhan.com/api/public/check-cx/dashboard',
  },
} as const;

export class SnapshotDecodeError extends Error {
  constructor() {
    super('health intelligence response did not match its typed schema');
    this.name = 'SnapshotDecodeError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || number(value);
}

function sourceMeta(value: Record<string, unknown>, id: SourceId): boolean {
  return value.id === id
    && text(value.label)
    && value.pageUrl === PUBLIC_SOURCE_METADATA[id].pageUrl
    && value.endpoint === PUBLIC_SOURCE_METADATA[id].endpoint
    && (value.status === 'ok' || value.status === 'stale' || value.status === 'error')
    && text(value.fetchedAt) && !Number.isNaN(Date.parse(value.fetchedAt))
    && nullableText(value.sourceUpdatedAt)
    && nullableNumber(value.ageSeconds)
    && number(value.attempts) && value.attempts >= 0 && value.attempts <= 12
    && nullableText(value.error) && (value.error === null || value.error.length <= 256);
}

function codexRadar(value: unknown): CodexRadarSnapshot | null {
  const source = object(value);
  if (!source || !sourceMeta(source, 'codexradar') || !Array.isArray(source.rows)) return null;
  const rows: CodexRadarRow[] = [];
  for (const value of source.rows) {
    const row = object(value);
    if (!row || !text(row.key) || !text(row.model) || !text(row.effort) || !number(row.iq)
      || !nullableNumber(row.softwareIq) || !nullableNumber(row.visualIq) || !number(row.samples)) return null;
    rows.push({
      key: row.key,
      model: row.model,
      effort: row.effort,
      iq: row.iq,
      softwareIq: row.softwareIq,
      visualIq: row.visualIq,
      samples: row.samples,
    });
  }
  return { ...source, id: 'codexradar', rows } as CodexRadarSnapshot;
}

function deepSwe(value: unknown): DeepSweSnapshot | null {
  const source = object(value);
  if (!source || !sourceMeta(source, 'deepswe') || !Array.isArray(source.rows)) return null;
  const rows: DeepSweRow[] = [];
  for (const value of source.rows) {
    const row = object(value);
    if (!row || !text(row.key) || !text(row.model) || !text(row.effort) || !number(row.passRate)
      || !nullableNumber(row.passAt4) || !nullableNumber(row.averageCostUsd)
      || !nullableNumber(row.outputTokens) || !nullableNumber(row.agentSteps) || !number(row.samples)) return null;
    rows.push({
      key: row.key,
      model: row.model,
      effort: row.effort,
      passRate: row.passRate,
      passAt4: row.passAt4,
      averageCostUsd: row.averageCostUsd,
      outputTokens: row.outputTokens,
      agentSteps: row.agentSteps,
      samples: row.samples,
    });
  }
  return { ...source, id: 'deepswe', rows } as DeepSweSnapshot;
}

function aixHan(value: unknown): AixHanSnapshot | null {
  const source = object(value);
  if (!source || !sourceMeta(source, 'aixhan') || !Array.isArray(source.rows)) return null;
  const rows: AixHanRow[] = [];
  for (const value of source.rows) {
    const row = object(value);
    if (!row || !text(row.key) || !text(row.name) || !nullableText(row.model)
      || !nullableText(row.providerType) || !['operational', 'degraded', 'error', 'unknown'].includes(String(row.status))
      || !nullableNumber(row.latencyMs) || !nullableNumber(row.pingLatencyMs)
      || !nullableText(row.checkedAt) || !nullableText(row.message)) return null;
    rows.push({
      key: row.key,
      name: row.name,
      model: row.model,
      providerType: row.providerType,
      status: row.status as AixHanRow['status'],
      latencyMs: row.latencyMs,
      pingLatencyMs: row.pingLatencyMs,
      checkedAt: row.checkedAt,
      message: row.message,
    });
  }
  return { ...source, id: 'aixhan', rows } as AixHanSnapshot;
}

function source(value: unknown): SourceSnapshot | null {
  const id = object(value)?.id;
  if (id === 'codexradar') return codexRadar(value);
  if (id === 'deepswe') return deepSwe(value);
  if (id === 'aixhan') return aixHan(value);
  return null;
}

/** Runtime validation keeps the DOM renderer free of unknown data. */
export function decodeSnapshot(value: unknown): HealthIntelligenceSnapshot {
  const root = object(value);
  if (!root || root.schemaVersion !== 1 || !text(root.generatedAt) || !Array.isArray(root.sources)
    || root.sources.length !== 3) throw new SnapshotDecodeError();
  const parsed = root.sources.map(source);
  if (!parsed[0] || !parsed[1] || !parsed[2]
    || parsed[0].id !== 'codexradar' || parsed[1].id !== 'deepswe' || parsed[2].id !== 'aixhan') {
    throw new SnapshotDecodeError();
  }
  return {
    schemaVersion: 1,
    generatedAt: root.generatedAt,
    sources: [parsed[0], parsed[1], parsed[2]],
  };
}

export async function fetchSnapshot(force = false, fetcher: typeof fetch = fetch): Promise<HealthIntelligenceSnapshot> {
  const url = force ? `${HEALTH_INTELLIGENCE_API}?refresh=1` : HEALTH_INTELLIGENCE_API;
  const response = await fetcher(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    headers: { accept: 'application/json' },
  });
  const body = await response.json() as unknown;
  if (!response.ok) throw new Error('health intelligence data is temporarily unavailable');
  return decodeSnapshot(body);
}
