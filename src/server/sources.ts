import type { SourceId } from '../shared/types.js';
import {
  assertFixedEndpoint,
  type FixedEndpoint,
} from './security.js';

export interface SourceSpec extends FixedEndpoint {
  readonly label: string;
  readonly dataPath: string;
}

const specs: Record<SourceId, SourceSpec> = {
  codexradar: {
    source: 'codexradar',
    label: 'Codex Radar 智商',
    pageUrl: 'https://codexradar.com/',
    endpoint: 'https://codexradar.com/api/radar-insights',
    robotsUrl: 'https://codexradar.com/robots.txt',
    dataPath: '/api/radar-insights',
  },
  deepswe: {
    source: 'deepswe',
    label: 'DeepSWE 工程能力',
    pageUrl: 'https://deepswe.datacurve.ai/',
    endpoint: 'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json',
    robotsUrl: 'https://deepswe.datacurve.ai/robots.txt',
    dataPath: '/artifacts/v1.1/leaderboard-live.json',
  },
  aixhan: {
    source: 'aixhan',
    label: 'CDK 模型健康',
    pageUrl: 'https://cdk.aixhan.com/model-health',
    endpoint: 'https://cdk.aixhan.com/api/public/check-cx/dashboard',
    robotsUrl: 'https://cdk.aixhan.com/robots.txt',
    dataPath: '/api/public/check-cx/dashboard',
  },
};

for (const spec of Object.values(specs)) {
  const parsed = assertFixedEndpoint(spec);
  if (parsed.pathname !== spec.dataPath) {
    throw new Error(`source endpoint path mismatch for ${spec.source}`);
  }
}

export const SOURCE_SPECS: Readonly<Record<SourceId, SourceSpec>> = Object.freeze(specs);

export function sourceSpec(id: SourceId): SourceSpec {
  return SOURCE_SPECS[id];
}
