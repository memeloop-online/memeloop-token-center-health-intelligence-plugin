import { SnapshotService, type FetchLike } from './fetcher.js';
import { createSourceRegistry, type SourceSpec } from './sources.js';
import { normalizeCodexRadar, normalizeDeepSwe, normalizeAixHan } from './normalizers.js';

const NORMALIZERS = Object.freeze({
  codexradar_v1: normalizeCodexRadar,
  deepswe_v1: normalizeDeepSwe,
  aixhan_v1: normalizeAixHan,
});

export interface RuntimeSource {
  readonly source: string;
  readonly label: string;
  readonly pageUrl: string;
  readonly endpoint: string;
  readonly robotsUrl: string;
  readonly dataPath: string;
  readonly maxObservationAgeSeconds: number;
  readonly normalizer: keyof typeof NORMALIZERS;
}

export interface RuntimeConfiguration {
  readonly sources: readonly RuntimeSource[];
}

export interface RuntimeAuthority {
  readonly pluginId: 'mtc-health-intelligence';
  readonly endpointId: 'health-intelligence';
  readonly allowedOrigins: readonly string[];
}

export function runtimeSources(config: RuntimeConfiguration, authority: RuntimeAuthority): readonly SourceSpec[] {
  if (authority.pluginId !== 'mtc-health-intelligence' || authority.endpointId !== 'health-intelligence'
    || !Array.isArray(config.sources) || config.sources.length === 0) {
    throw new Error('invalid health runtime authority or configuration');
  }
  const sources = config.sources.map((source: RuntimeSource): SourceSpec => {
    if (!Object.hasOwn(NORMALIZERS, source.normalizer)
      || typeof source.label !== 'string' || source.label.length === 0 || source.label.length > 120
      || !authority.allowedOrigins.includes(new URL(source.endpoint).origin)) {
      throw new Error('health runtime source is outside the declared contract');
    }
    const { normalizer, ...definition } = source;
    return { ...definition, normalize: NORMALIZERS[normalizer] };
  });
  return [...createSourceRegistry(sources).values()];
}

export function createRuntimeCollector(config: RuntimeConfiguration, authority: RuntimeAuthority, fetch: FetchLike): SnapshotService {
  return new SnapshotService({
    sources: runtimeSources(config, authority), fetch,
    policy: { timeoutMs: 4_000, retries: 0, bodyCapBytes: 1_048_576 },
    cacheTtlMs: 300_000,
    failureCacheTtlMs: 30_000,
  });
}
