/**
 * Adapter for the current MTC operator contribution contract. The core owns the renderer and
 * calls the named service-data endpoint; this package never asks the browser
 * to load a plugin script, document, stylesheet, or iframe.
 */

export const CORE_UI_CONTRACT = 'typed_data_v1';
export const HEALTH_INTELLIGENCE_PRESENTATION = 'health_intelligence_v1';
export const HEALTH_INTELLIGENCE_PLUGIN_ID = 'mtc-health-intelligence';
export const HEALTH_INTELLIGENCE_TAB_ID = 'health-and-intelligence';
export const HEALTH_INTELLIGENCE_ENDPOINT_ID = 'health-intelligence';
export const HEALTH_INTELLIGENCE_SERVICE_URL = 'https://memeloop-online.github.io/memeloop-token-center-health-intelligence-plugin/api/health-intelligence.json';

export interface HealthIntelligenceServiceDataContribution {
  readonly id: typeof HEALTH_INTELLIGENCE_ENDPOINT_ID;
  readonly url: typeof HEALTH_INTELLIGENCE_SERVICE_URL;
  readonly requiredScope: 'metrics:read';
  readonly responseSchema: Record<string, unknown>;
  readonly fallback: Record<string, unknown>;
  readonly cacheTtlSeconds: 300;
  readonly timeoutMillis: 4_000;
  readonly maxBodyBytes: 1_048_576;
}

export interface HealthIntelligenceTabContribution {
  readonly id: typeof HEALTH_INTELLIGENCE_TAB_ID;
  readonly slot: 'operator.sidebar.tab';
  readonly category: { readonly id: 'monitoring' };
  readonly route: 'health-intelligence';
  readonly label: '模型健康与能力';
  readonly icon: 'heart';
  readonly renderer: 'typed_data_v1';
  readonly presentation: typeof HEALTH_INTELLIGENCE_PRESENTATION;
  readonly dataEndpoint: typeof HEALTH_INTELLIGENCE_ENDPOINT_ID;
}

export interface HealthIntelligenceManifestContribution {
  readonly serviceData: HealthIntelligenceServiceDataContribution;
  readonly tab: HealthIntelligenceTabContribution;
}

export class ManifestContractError extends Error {
  readonly code = 'manifest_contract';

  constructor(message: string) {
    super(message);
    this.name = 'ManifestContractError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function exactServiceUrl(value: unknown): value is typeof HEALTH_INTELLIGENCE_SERVICE_URL {
  if (value !== HEALTH_INTELLIGENCE_SERVICE_URL) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
}

function responseSchema(value: unknown): Record<string, unknown> {
  const schema = object(value);
  if (!schema || schema.type !== 'object') {
    throw new ManifestContractError('service_data response_schema must be an object-root schema');
  }
  return schema;
}

function fallback(value: unknown): Record<string, unknown> {
  const result = object(value);
  if (!result) throw new ManifestContractError('service_data fallback must be an object');
  return result;
}

function serviceData(value: unknown): HealthIntelligenceServiceDataContribution {
  const candidate = object(value);
  if (!candidate
    || candidate.id !== HEALTH_INTELLIGENCE_ENDPOINT_ID
    || !exactServiceUrl(candidate.url)
    || candidate.required_scope !== 'metrics:read'
    || candidate.cache_ttl_seconds !== 300
    || candidate.timeout_millis !== 4_000
    || candidate.max_body_bytes !== 1_048_576) {
    throw new ManifestContractError('health intelligence service_data does not match the core v1 contract');
  }
  return {
    id: HEALTH_INTELLIGENCE_ENDPOINT_ID,
    url: HEALTH_INTELLIGENCE_SERVICE_URL,
    requiredScope: 'metrics:read',
    responseSchema: responseSchema(candidate.response_schema),
    fallback: fallback(candidate.fallback),
    cacheTtlSeconds: 300,
    timeoutMillis: 4_000,
    maxBodyBytes: 1_048_576,
  };
}

function tab(value: unknown): HealthIntelligenceTabContribution {
  const candidate = object(value);
  const category = candidate ? object(candidate.category) : null;
  if (!candidate
    || candidate.id !== HEALTH_INTELLIGENCE_TAB_ID
    || candidate.slot !== 'operator.sidebar.tab'
    || !category
    || category.id !== 'monitoring'
    || Object.prototype.hasOwnProperty.call(category, 'label')
    || candidate.route !== 'health-intelligence'
    || candidate.label !== '模型健康与能力'
    || candidate.icon !== 'heart'
    || candidate.renderer !== CORE_UI_CONTRACT
    || candidate.presentation !== HEALTH_INTELLIGENCE_PRESENTATION
    || candidate.data_endpoint !== HEALTH_INTELLIGENCE_ENDPOINT_ID
    || Object.prototype.hasOwnProperty.call(candidate, 'entry')
    || Object.prototype.hasOwnProperty.call(candidate, 'remote_content')) {
    throw new ManifestContractError('health intelligence operator_ui entry does not match the core v1 contract');
  }
  return {
    id: HEALTH_INTELLIGENCE_TAB_ID,
    slot: 'operator.sidebar.tab',
    category: { id: 'monitoring' },
    route: 'health-intelligence',
    label: '模型健康与能力',
    icon: 'heart',
    renderer: 'typed_data_v1',
    presentation: HEALTH_INTELLIGENCE_PRESENTATION,
    dataEndpoint: HEALTH_INTELLIGENCE_ENDPOINT_ID,
  };
}

/** Read the single service-data feed and Monitoring sidebar tab in plugin.json. */
export function readHealthIntelligenceManifest(manifest: unknown): HealthIntelligenceManifestContribution {
  const root = object(manifest);
  const contributions = root ? object(root.contributions) : null;
  if (string(root?.id) !== HEALTH_INTELLIGENCE_PLUGIN_ID || !contributions
    || Object.prototype.hasOwnProperty.call(contributions, 'ui')) {
    throw new ManifestContractError('manifest is not a core operator-contribution v1 manifest');
  }
  const serviceEntries = contributions.service_data;
  const uiEntries = contributions.operator_ui;
  if (!Array.isArray(serviceEntries) || serviceEntries.length !== 1
    || !Array.isArray(uiEntries) || uiEntries.length !== 1) {
    throw new ManifestContractError('manifest must expose exactly one service_data feed and one operator_ui tab');
  }
  const endpoint = serviceData(serviceEntries[0]);
  const contribution = tab(uiEntries[0]);
  if (contribution.dataEndpoint !== endpoint.id) {
    throw new ManifestContractError('operator_ui data_endpoint must reference service_data');
  }
  return { serviceData: endpoint, tab: contribution };
}

/** Backwards-friendly name for callers that only need the Monitoring tab. */
export function readHealthIntelligenceTab(manifest: unknown): HealthIntelligenceTabContribution {
  return readHealthIntelligenceManifest(manifest).tab;
}
