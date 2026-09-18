import type {
  AixHanRow,
  CodexRadarRow,
  DeepSweRow,
  HealthIntelligenceSnapshot,
  SourceId,
  SourceSnapshot,
} from '../shared/types.js';
import { SOURCE_IDS } from '../shared/types.js';
import { sourceSpec } from './sources.js';

export class SnapshotDecodeError extends Error {
  constructor() {
    super('health intelligence response does not match schema version 1');
    this.name = 'SnapshotDecodeError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = 160): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function nullableText(value: unknown, max = 160): value is string | null {
  return value === null || text(value, max);
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function boundedNumber(value: unknown, min: number, max: number): value is number {
  return number(value) && value >= min && value <= max;
}

function nullableNumber(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number | null {
  return value === null || boundedNumber(value, min, max);
}

function date(value: unknown): value is string {
  return text(value, 80) && !Number.isNaN(Date.parse(value));
}

function sourceMeta(value: Record<string, unknown>, id: SourceId): boolean {
  const spec = sourceSpec(id);
  return value.id === id
    && text(value.label, 120)
    && value.pageUrl === spec.pageUrl
    && value.endpoint === spec.endpoint
    && (value.status === 'ok' || value.status === 'stale' || value.status === 'error')
    && date(value.fetchedAt)
    && (value.sourceUpdatedAt === null || date(value.sourceUpdatedAt))
    && nullableNumber(value.ageSeconds)
    && number(value.attempts) && Number.isInteger(value.attempts) && boundedNumber(value.attempts, 0, 12)
    && nullableText(value.error, 256);
}

function codexRadarRow(value: unknown): CodexRadarRow | null {
  const row = record(value);
  if (!row || !text(row.key, 180) || !text(row.model) || !text(row.effort)
    || !boundedNumber(row.iq, 0, 200)
    || !nullableNumber(row.softwareIq, -1000, 1000)
    || !nullableNumber(row.visualIq, -1000, 1000)
    || !number(row.samples) || !Number.isInteger(row.samples) || !boundedNumber(row.samples, 0, 1_000_000_000)) return null;
  return row as unknown as CodexRadarRow;
}

function deepSweRow(value: unknown): DeepSweRow | null {
  const row = record(value);
  if (!row || !text(row.key, 180) || !text(row.model) || !text(row.effort)
    || !boundedNumber(row.passRate, 0, 1)
    || !nullableNumber(row.passAt4, 0, 1)
    || !nullableNumber(row.averageCostUsd, 0, 1_000_000)
    || !nullableNumber(row.outputTokens)
    || !nullableNumber(row.agentSteps)
    || !number(row.samples) || !Number.isInteger(row.samples) || !boundedNumber(row.samples, 0, 1_000_000_000)) return null;
  return row as unknown as DeepSweRow;
}

function aixHanRow(value: unknown): AixHanRow | null {
  const row = record(value);
  if (!row || !text(row.key, 180) || !text(row.name)
    || !nullableText(row.model) || !nullableText(row.providerType)
    || !['operational', 'degraded', 'error', 'unknown'].includes(String(row.status))
    || !nullableNumber(row.latencyMs, 0, 86_400_000)
    || !nullableNumber(row.pingLatencyMs, 0, 86_400_000)
    || !(row.checkedAt === null || date(row.checkedAt))
    || !nullableText(row.message)) return null;
  return row as unknown as AixHanRow;
}

function source(value: unknown, id: SourceId): SourceSnapshot | null {
  const candidate = record(value);
  if (!candidate || !sourceMeta(candidate, id) || !Array.isArray(candidate.rows) || candidate.rows.length > 24) return null;
  const rows = candidate.rows.map((row) => id === 'codexradar'
    ? codexRadarRow(row)
    : id === 'deepswe' ? deepSweRow(row) : aixHanRow(row));
  if (rows.some((row) => row === null)) return null;
  return { ...candidate, id, rows } as unknown as SourceSnapshot;
}

export function decodeSnapshot(value: unknown): HealthIntelligenceSnapshot {
  const root = record(value);
  if (!root || root.schemaVersion !== 1 || !date(root.generatedAt)
    || !Array.isArray(root.sources) || root.sources.length !== SOURCE_IDS.length) throw new SnapshotDecodeError();
  const sources = SOURCE_IDS.map((id, index) => source(root.sources[index], id));
  if (sources.some((entry) => entry === null)) throw new SnapshotDecodeError();
  return {
    schemaVersion: 1,
    generatedAt: root.generatedAt,
    sources: sources as HealthIntelligenceSnapshot['sources'],
  };
}
