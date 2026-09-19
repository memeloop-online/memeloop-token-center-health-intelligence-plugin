import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const manifest = json('plugin.json');
const reviewedSchema = json('schemas-health-intelligence.json');
const installerTrust = json('release/installer-trust.json');

assert.equal(manifest.id, 'mtc-health-intelligence');
assert.equal(manifest.version, '1.1.0');
assert.equal(manifest.wit_version, '0.2.0');
assert.equal(manifest.wasm, null);
assert.deepEqual(manifest.capabilities, [{
  kind: 'http',
  allowed_origins: ['https://memeloop-online.github.io'],
}]);
assert.equal(manifest.contributions.traffic_policy, false);
assert.equal(manifest.contributions.request_rewrite, false);
assert.equal(manifest.contributions.configuration, null);
assert.deepEqual(manifest.contributions.providers, []);
assert.equal(manifest.contributions.service_data.length, 1);
assert.equal(manifest.contributions.operator_ui.length, 1);

const endpoint = manifest.contributions.service_data[0];
assert.equal(endpoint.id, 'health-intelligence');
assert.equal(endpoint.url, 'https://memeloop-online.github.io/memeloop-token-center-health-intelligence-plugin/api/health-intelligence.json');
assert.equal(endpoint.required_scope, 'metrics:read');
assert.deepEqual(endpoint.response_schema, reviewedSchema);
assert.equal(endpoint.cache_ttl_seconds, 300);
assert.equal(endpoint.timeout_millis, 4000);
assert.equal(endpoint.max_body_bytes, 1_048_576);
assert.equal(endpoint.fallback.schemaVersion, 1);
assert.deepEqual(endpoint.fallback.sources.map((source) => source.id), ['codexradar', 'deepswe', 'aixhan']);
assert(endpoint.fallback.sources.every((source) => source.status === 'error' && source.rows.length === 0));

const tab = manifest.contributions.operator_ui[0];
assert.deepEqual(tab, {
  id: 'health-and-intelligence',
  slot: 'operator.sidebar.tab',
  category: { id: 'monitoring' },
  route: 'health-intelligence',
  label: '模型健康与能力',
  icon: 'heart',
  renderer: 'component_v1',
  module_entry: 'ui/health-intelligence.mjs',
  component_id: 'health-intelligence',
  data_endpoint: 'health-intelligence',
});

assert.equal(installerTrust.format_version, 1);
assert.equal(installerTrust.status, 'ready');
assert.match(installerTrust.host_contract_revision, /^[0-9a-f]{40}$/);
assert.equal(installerTrust.installer_repository, 'ghcr.io/memeloop-online/memeloop-token-center-plugin-installer');
assert.match(installerTrust.installer_digest, /^sha256:[0-9a-f]{64}$/);
assert.match(installerTrust.installer_source_revision, /^[0-9a-f]{40}$/);
assert.equal(installerTrust.minimum_installer_contract_revision, 'd21f73377f96197fea9f0c34b7a93836458d81af');
assert.equal(installerTrust.cosign_version, 'v3.1.3-mtc.3');

const sources = read('src/server/sources.ts');
for (const expected of [
  'https://codexradar.com/api/radar-insights',
  'https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json',
  'https://cdk.aixhan.com/api/public/check-cx/dashboard',
]) assert(sources.includes(expected));

const forbidden = [
  ['.example', 'invalid'].join('.'),
  ['mtc-transient', 'health'].join('-'),
  ['group-routing', 'v2'].join('-'),
  ['<', 'iframe'].join(''),
  ['dangerouslySet', 'InnerHTML'].join(''),
  ['BEGIN PRIVATE', 'KEY'].join(' '),
];
const textExtensions = new Set(['.json', '.md', '.mjs', '.ts', '.yml', '.yaml']);
function scan(directory) {
  for (const name of readdirSync(directory)) {
    if (name === '.git' || name === 'node_modules' || name === 'dist' || name === 'site'
        || name === 'mtc-core' || name === 'mtc-installer-contract') continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      scan(path);
      continue;
    }
    if (!textExtensions.has(extname(path))) continue;
    const value = readFileSync(path, 'utf8');
    for (const needle of forbidden) {
      assert(!value.includes(needle), `${relative(root, path)} contains forbidden text: ${needle}`);
    }
  }
}
scan(root);

const coreRoot = process.argv[2];
if (coreRoot) {
  assert.equal(execFileSync('git', ['-C', coreRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    installerTrust.host_contract_revision, 'host checkout differs from the reviewed trust revision');
  const coreSchema = JSON.parse(readFileSync(join(coreRoot, 'schemas/plugin-manifest.schema.json'), 'utf8'));
  const contributions = coreSchema.properties?.contributions?.properties;
  assert(contributions?.service_data, 'pinned MTC schema lacks service_data');
  assert(contributions?.operator_ui, 'pinned MTC schema lacks operator_ui');
  const operatorUi = readFileSync(join(coreRoot, 'web/src/operator/pluginContributions.tsx'), 'utf8');
  assert(operatorUi.includes("renderer === 'component_v1'"));
}

const installerRoot = process.argv[3];
if (installerRoot) {
  assert.equal(execFileSync('git', ['-C', installerRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    installerTrust.installer_source_revision, 'installer checkout differs from the reviewed trust revision');
  const installerManifestSchema = JSON.parse(readFileSync(join(installerRoot, 'schemas/plugin-manifest.schema.json'), 'utf8'));
  const contributions = installerManifestSchema.properties?.contributions?.properties;
  assert(contributions?.service_data, 'pinned installer schema lacks service_data');
  assert(contributions?.operator_ui, 'pinned installer schema lacks operator_ui');
  assert(contributions.operator_ui.items?.properties?.renderer?.enum?.includes('component_v1'),
    'pinned installer schema lacks component_v1');

  const pluginSource = readFileSync(join(installerRoot, 'src/plugin.rs'), 'utf8');
  assert(pluginSource.includes('"component_v1"'), 'pinned installer runtime lacks component_v1');
  assert(pluginSource.includes('validate_service_data_contributions(manifest)?'),
    'pinned installer runtime lacks authoritative service_data validation');

  const schemaSource = readFileSync(join(installerRoot, 'src/schema.rs'), 'utf8');
  const supportedExpression = schemaSource.match(/matches!\(format,\s*([^)]+)\)/s)?.[1];
  assert(supportedExpression, 'could not read pinned installer JSON Schema format allowlist');
  const supportedFormats = new Set([...supportedExpression.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  const declaredFormats = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.format === 'string') declaredFormats.add(value.format);
    Object.values(value).forEach(visit);
  };
  visit(endpoint.response_schema);
  for (const format of declaredFormats) {
    assert(supportedFormats.has(format), `response schema format ${format} is unsupported by the pinned installer`);
  }
}

console.log('health intelligence contracts verified');
