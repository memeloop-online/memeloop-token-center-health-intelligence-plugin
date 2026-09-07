/**
 * The only data contract crossing the server/browser boundary.  Raw upstream
 * payloads never appear in this type (or in an API response).
 */

export type SourceId = 'codexradar' | 'deepswe' | 'aixhan';
export type SourceStatus = 'ok' | 'stale' | 'error';

export interface SourceMeta {
  id: SourceId;
  label: string;
  pageUrl: string;
  endpoint: string;
  status: SourceStatus;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  ageSeconds: number | null;
  attempts: number;
  error: string | null;
}

export interface CodexRadarRow {
  key: string;
  model: string;
  effort: string;
  iq: number;
  softwareIq: number | null;
  visualIq: number | null;
  samples: number;
}

export interface DeepSweRow {
  key: string;
  model: string;
  effort: string;
  passRate: number;
  passAt4: number | null;
  averageCostUsd: number | null;
  outputTokens: number | null;
  agentSteps: number | null;
  samples: number;
}

export type AixHanStatus = 'operational' | 'degraded' | 'error' | 'unknown';

export interface AixHanRow {
  key: string;
  name: string;
  model: string | null;
  providerType: string | null;
  status: AixHanStatus;
  latencyMs: number | null;
  pingLatencyMs: number | null;
  checkedAt: string | null;
  message: string | null;
}

export interface CodexRadarSnapshot extends SourceMeta {
  id: 'codexradar';
  rows: CodexRadarRow[];
}

export interface DeepSweSnapshot extends SourceMeta {
  id: 'deepswe';
  rows: DeepSweRow[];
}

export interface AixHanSnapshot extends SourceMeta {
  id: 'aixhan';
  rows: AixHanRow[];
}

export type SourceSnapshot = CodexRadarSnapshot | DeepSweSnapshot | AixHanSnapshot;

export interface HealthIntelligenceSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  sources: [CodexRadarSnapshot, DeepSweSnapshot, AixHanSnapshot];
}

export const SOURCE_IDS: readonly SourceId[] = ['codexradar', 'deepswe', 'aixhan'];

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}
