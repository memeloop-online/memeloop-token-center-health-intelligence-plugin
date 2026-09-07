import type {
  AixHanRow,
  CodexRadarRow,
  DeepSweRow,
  HealthIntelligenceSnapshot,
  SourceId,
  SourceSnapshot,
} from '../shared/types.js';
import { SOURCE_IDS } from '../shared/types.js';
import {
  InvalidPayloadError,
  normalizeAixHan,
  normalizeCodexRadar,
  normalizeDeepSwe,
} from './normalizers.js';
import {
  assertExactAllowedOrigin,
  parseRobots,
  robotsUnavailable,
  type RobotsRules,
} from './security.js';
import { sourceSpec, type SourceSpec } from './sources.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FetchFailureCode =
  | 'timeout'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'body_too_large'
  | 'not_json'
  | 'invalid_payload'
  | 'robots_denied'
  | 'robots_unavailable';

export class SourceFetchError extends Error {
  readonly code: FetchFailureCode;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(code: FetchFailureCode, message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = 'SourceFetchError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export interface FetchPolicy {
  readonly timeoutMs: number;
  readonly retries: number;
  readonly bodyCapBytes: number;
  readonly robotsBodyCapBytes: number;
  readonly retryDelayMs: readonly number[];
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = Object.freeze({
  timeoutMs: 4_000,
  retries: 2,
  bodyCapBytes: 2 * 1024 * 1024,
  robotsBodyCapBytes: 64 * 1024,
  retryDelayMs: [100, 300],
});

export interface SnapshotServiceOptions {
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly policy?: Partial<FetchPolicy>;
  readonly cacheTtlMs?: number;
}

interface ResolvedSnapshotOptions {
  readonly fetch: FetchLike;
  readonly now: () => Date;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly policy: FetchPolicy;
  readonly cacheTtlMs: number;
}

interface CachedSource {
  readonly sourceUpdatedAt: string | null;
  readonly fetchedAt: string;
  readonly rows: SourceSnapshot['rows'];
}

interface DataResponse {
  readonly body: unknown;
  readonly attempts: number;
}

const USER_AGENT = 'memeloop-health-intelligence-example/0.1 (public-readonly)';
const MAX_RETRY_AFTER_MS = 2_000;

function mergePolicy(policy: Partial<FetchPolicy> | undefined): FetchPolicy {
  const merged = {
    ...DEFAULT_FETCH_POLICY,
    ...policy,
    retryDelayMs: policy?.retryDelayMs ?? DEFAULT_FETCH_POLICY.retryDelayMs,
  };
  if (!Number.isInteger(merged.timeoutMs) || merged.timeoutMs < 100 || merged.timeoutMs > 30_000) {
    throw new Error('timeoutMs must be between 100 and 30000');
  }
  if (!Number.isInteger(merged.retries) || merged.retries < 0 || merged.retries > 3) {
    throw new Error('retries must be between 0 and 3');
  }
  if (!Number.isInteger(merged.bodyCapBytes) || merged.bodyCapBytes < 1_024 || merged.bodyCapBytes > 8 * 1024 * 1024) {
    throw new Error('bodyCapBytes is outside the safe range');
  }
  if (!Number.isInteger(merged.robotsBodyCapBytes) || merged.robotsBodyCapBytes < 1_024 || merged.robotsBodyCapBytes > 256 * 1024) {
    throw new Error('robotsBodyCapBytes is outside the safe range');
  }
  return Object.freeze(merged);
}

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.ceil(seconds * 1_000));
}

async function readBodyWithCap(response: Response, capBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > capBytes) {
      throw new SourceFetchError('body_too_large', 'public source response exceeded the body limit', false);
    }
  }
  if (!response.body) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > capBytes) {
      throw new SourceFetchError('body_too_large', 'public source response exceeded the body limit', false);
    }
    return body;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > capBytes) {
        await reader.cancel();
        throw new SourceFetchError('body_too_large', 'public source response exceeded the body limit', false);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function fetchResponse(
  url: string,
  options: ResolvedSnapshotOptions,
  capBytes: number,
  acceptedContentType: 'json' | 'robots',
): Promise<{ response: Response; body: string; attempts: number }> {
  assertExactAllowedOrigin(url);
  let lastError: SourceFetchError | undefined;
  for (let attempt = 0; attempt <= options.policy.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.policy.timeoutMs);
    try {
      const response = await options.fetch(url, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        headers: {
          accept: acceptedContentType === 'json' ? 'application/json' : 'text/plain',
          'user-agent': USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const code: FetchFailureCode = response.status >= 500 ? 'http_5xx' : 'http_4xx';
        // Consume and discard the bounded error body. It is never returned to
        // the caller, and this allows pooled connections to be reused.
        try {
          await readBodyWithCap(response, Math.min(capBytes, 16 * 1024));
        } catch {
          // The status is sufficient for the public error classification.
        }
        clearTimeout(timeout);
        lastError = new SourceFetchError(code, `public source returned HTTP ${response.status}`, retryable, response.status);
        if (!retryable || attempt >= options.policy.retries) throw lastError;
        const delay = retryAfterMilliseconds(response)
          ?? options.policy.retryDelayMs[Math.min(attempt, options.policy.retryDelayMs.length - 1)]
          ?? 0;
        await options.sleep(Math.max(0, delay));
        continue;
      }
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (acceptedContentType === 'json' && contentType.includes('text/html')) {
        throw new SourceFetchError('not_json', 'public data endpoint returned HTML', false);
      }
      const body = await readBodyWithCap(response, capBytes);
      clearTimeout(timeout);
      return { response, body, attempts: attempt + 1 };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof SourceFetchError) {
        lastError = error;
      } else if (controller.signal.aborted) {
        lastError = new SourceFetchError('timeout', 'public source request timed out', true);
      } else {
        lastError = new SourceFetchError('network', 'public source request failed', true);
      }
      if (!lastError.retryable || attempt >= options.policy.retries) throw lastError;
      const delay = options.policy.retryDelayMs[Math.min(attempt, options.policy.retryDelayMs.length - 1)] ?? 0;
      await options.sleep(Math.max(0, delay));
    }
  }
  throw lastError ?? new SourceFetchError('network', 'public source request failed', true);
}

async function fetchJson(
  url: string,
  options: ResolvedSnapshotOptions,
): Promise<DataResponse> {
  const result = await fetchResponse(url, options, options.policy.bodyCapBytes, 'json');
  try {
    return { body: JSON.parse(result.body) as unknown, attempts: result.attempts };
  } catch {
    throw new SourceFetchError('not_json', 'public data endpoint returned invalid JSON', false);
  }
}

async function fetchRobots(
  spec: SourceSpec,
  options: ResolvedSnapshotOptions,
): Promise<{ rules: RobotsRules; attempts: number }> {
  try {
    const result = await fetchResponse(spec.robotsUrl, options, options.policy.robotsBodyCapBytes, 'robots');
    return {
      rules: parseRobots(result.body, spec.robotsUrl, spec.dataPath),
      attempts: result.attempts,
    };
  } catch (error) {
    if (error instanceof SourceFetchError && error.code === 'http_4xx' && (error.status === 404 || error.status === 410)) {
      // A missing robots file has no directives to apply.  Other 4xx values
      // are still represented as unavailable by fetchResponse's coarse class.
      return {
        rules: { kind: 'missing', sourceUrl: spec.robotsUrl, checkedPath: spec.dataPath, allowed: true },
        attempts: 1,
      };
    }
    return {
      rules: robotsUnavailable(spec.robotsUrl, spec.dataPath),
      attempts: error instanceof SourceFetchError ? options.policy.retries + 1 : 1,
    };
  }
}

function sourceRows(source: SourceId, body: unknown): { sourceUpdatedAt: string | null; rows: SourceSnapshot['rows'] } {
  switch (source) {
    case 'codexradar':
      return normalizeCodexRadar(body);
    case 'deepswe':
      return normalizeDeepSwe(body);
    case 'aixhan':
      return normalizeAixHan(body);
  }
}

function publicError(error: unknown): { code: FetchFailureCode; message: string } {
  if (error instanceof SourceFetchError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof InvalidPayloadError) {
    return { code: 'invalid_payload', message: error.message };
  }
  return { code: 'invalid_payload', message: 'public source returned an unsupported data shape' };
}

function optionsFor(input: SnapshotServiceOptions): ResolvedSnapshotOptions {
  return {
    fetch: input.fetch ?? defaultFetch,
    now: input.now ?? (() => new Date()),
    sleep: input.sleep ?? defaultSleep,
    policy: mergePolicy(input.policy),
    cacheTtlMs: input.cacheTtlMs ?? 5 * 60_000,
  };
}

function ageSeconds(fetchedAt: string, now: Date): number | null {
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1_000));
}

function sourceSnapshot(
  spec: SourceSpec,
  sourceStatus: SourceSnapshot['status'],
  fetchedAt: string,
  sourceUpdatedAt: string | null,
  rows: SourceSnapshot['rows'],
  attempts: number,
  error: string | null,
  now: Date,
): SourceSnapshot {
  const meta = {
    id: spec.source,
    label: spec.label,
    pageUrl: spec.pageUrl,
    endpoint: spec.endpoint,
    status: sourceStatus,
    fetchedAt,
    sourceUpdatedAt,
    ageSeconds: ageSeconds(fetchedAt, now),
    attempts,
    error,
  };
  switch (spec.source) {
    case 'codexradar': return { ...meta, id: 'codexradar', rows: rows as CodexRadarRow[] };
    case 'deepswe': return { ...meta, id: 'deepswe', rows: rows as DeepSweRow[] };
    case 'aixhan': return { ...meta, id: 'aixhan', rows: rows as AixHanRow[] };
  }
}

export class SnapshotService {
  private readonly options: ResolvedSnapshotOptions;
  private readonly cache = new Map<SourceId, CachedSource>();
  private inFlight: Promise<HealthIntelligenceSnapshot> | null = null;

  constructor(options: SnapshotServiceOptions = {}) {
    this.options = optionsFor(options);
    if (!Number.isInteger(this.options.cacheTtlMs) || this.options.cacheTtlMs < 0 || this.options.cacheTtlMs > 60 * 60_000) {
      throw new Error('cacheTtlMs is outside the safe range');
    }
  }

  async read(force = false): Promise<HealthIntelligenceSnapshot> {
    if (!force && this.inFlight) return this.inFlight;
    const request = this.readSources(force);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) this.inFlight = null;
    }
  }

  private async readSources(force: boolean): Promise<HealthIntelligenceSnapshot> {
    const now = this.options.now();
    const values = await Promise.all(SOURCE_IDS.map((id) => this.readSource(id, now, force)));
    const byId = new Map(values.map((value) => [value.id, value]));
    return {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      sources: [
        byId.get('codexradar') as Extract<SourceSnapshot, { id: 'codexradar' }>,
        byId.get('deepswe') as Extract<SourceSnapshot, { id: 'deepswe' }>,
        byId.get('aixhan') as Extract<SourceSnapshot, { id: 'aixhan' }>,
      ],
    };
  }

  private async readSource(id: SourceId, now: Date, force: boolean): Promise<SourceSnapshot> {
    const spec = sourceSpec(id);
    const cached = this.cache.get(id);
    if (!force && cached && now.getTime() - Date.parse(cached.fetchedAt) < this.options.cacheTtlMs) {
      return sourceSnapshot(spec, 'ok', cached.fetchedAt, cached.sourceUpdatedAt, cached.rows, 0, null, now);
    }
    let attempts = 0;
    try {
      const robots = await fetchRobots(spec, this.options);
      attempts += robots.attempts;
      if (!robots.rules.allowed) {
        const code: FetchFailureCode = robots.rules.kind === 'unavailable' ? 'robots_unavailable' : 'robots_denied';
        throw new SourceFetchError(code, code === 'robots_denied'
          ? 'robots policy disallows this public endpoint'
          : 'robots policy could not be verified', false);
      }
      const result = await fetchJson(spec.endpoint, this.options);
      attempts += result.attempts;
      const normalized = sourceRows(id, result.body);
      const fetchedAt = now.toISOString();
      this.cache.set(id, {
        sourceUpdatedAt: normalized.sourceUpdatedAt,
        fetchedAt,
        rows: normalized.rows,
      });
      return sourceSnapshot(spec, 'ok', fetchedAt, normalized.sourceUpdatedAt, normalized.rows, attempts, null, now);
    } catch (error) {
      const failure = publicError(error);
      if (cached) {
        return sourceSnapshot(spec, 'stale', cached.fetchedAt, cached.sourceUpdatedAt, cached.rows, attempts, failure.message, now);
      }
      return sourceSnapshot(spec, 'error', now.toISOString(), null, [], attempts, failure.message, now);
    }
  }
}

export { fetchJson, readBodyWithCap };
