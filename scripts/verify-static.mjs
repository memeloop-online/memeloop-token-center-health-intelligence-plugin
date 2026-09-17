import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const manifest = json('plugin.json');
const trust = json('release/mtc-installer-trust.json');
const contribution = manifest.contributions?.group_routing;

assert.equal(manifest.id, 'mtc-transient-health');
assert.equal(manifest.version, '1.0.0');
assert.equal(manifest.wit_version, '0.2.0');
assert.equal(manifest.wasm, 'plugin.wasm');
assert.deepEqual(manifest.capabilities, []);
assert.deepEqual(Object.keys(manifest.contributions), ['group_routing']);
assert.equal(contribution.version, 'group-routing-v2');
assert.equal(contribution.health_policy, 'plugin');
assert.equal(contribution.schema.type, 'object');
assert.equal(contribution.schema.additionalProperties, false);

const required = [
  'transient_health_mode', 'min_samples', 'open_micros', 'recover_micros',
  'min_probe_successes', 'cooldown_ms', 'recovery_wait_ms', 'recheck_ms',
];
assert.deepEqual(contribution.schema.required, required);
assert.deepEqual(Object.keys(contribution.default), required);
assert.equal(contribution.default.transient_health_mode, 'shadow');
assert(contribution.default.recover_micros <= contribution.default.open_micros);
for (const field of required) {
  const schema = contribution.schema.properties[field];
  assert(schema, `missing schema for ${field}`);
  const value = contribution.default[field];
  if (schema.enum) assert(schema.enum.includes(value), `${field} default is outside enum`);
  if (schema.minimum !== undefined) assert(value >= schema.minimum, `${field} default below minimum`);
  if (schema.maximum !== undefined) assert(value <= schema.maximum, `${field} default above maximum`);
}

assert.equal(trust.format_version, 1);
assert.match(trust.core_revision, /^[0-9a-f]{40}$/);
assert.match(trust.installer_digest, /^sha256:[0-9a-f]{64}$/);
assert.match(trust.installer_source_revision, /^[0-9a-f]{40}$/);
assert.equal(trust.installer_repository, 'ghcr.io/memeloop-online/memeloop-token-center-plugin-installer');
assert.equal(trust.cosign_version, 'v3.1.3-mtc.3');
assert.match(trust.wasm_tools_sha256, /^[0-9a-f]{64}$/);

const cargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
assert.match(cargo, /^name = "mtc-transient-health"$/m);
assert.match(cargo, /^version = "1.0.0"$/m);
assert.match(cargo, /^wit-bindgen = "=0\.57\.1"$/m);

const forbidden = [
  ['.example', 'invalid'].join('.'),
  ['.svc', 'cluster', 'local'].join('.'),
  ['cluster', 'local'].join('.'),
  ['forgejo', 'svc'].join('.'),
  ['/home/token', 'center-dev'].join('-'),
  ['BEGIN PRIVATE', 'KEY'].join(' '),
  ['COSIGN', 'PASSWORD='].join('_'),
];
const textExtensions = new Set(['.json', '.md', '.mjs', '.rs', '.toml', '.wit', '.yml', '.yaml']);
function extension(path) {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index);
}
function scan(directory) {
  for (const name of readdirSync(directory)) {
    if (name === '.git' || name === 'target' || name === 'mtc-core') continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      scan(path);
      continue;
    }
    if (!textExtensions.has(extension(path))) continue;
    const value = readFileSync(path, 'utf8');
    for (const needle of forbidden) {
      assert(!value.includes(needle), `${relative(root, path)} contains forbidden text: ${needle}`);
    }
  }
}
scan(root);

const coreRoot = process.argv[2];
if (coreRoot) {
  const expected = readFileSync(join(coreRoot, 'wit/token-center.wit'));
  const vendored = readFileSync(join(root, 'wit/token-center.wit'));
  assert.deepEqual(vendored, expected, 'vendored WIT differs from pinned MTC core revision');
  const coreManifestSchema = jsonFrom(join(coreRoot, 'schemas/plugin-manifest.schema.json'));
  assert(coreManifestSchema.properties?.contributions?.properties?.group_routing,
    'pinned MTC schema has no group_routing contribution');
  const versions = coreManifestSchema.properties.contributions.properties.group_routing
    .properties.version.enum;
  assert(versions.includes('group-routing-v2'), 'pinned MTC schema lacks group-routing-v2');
}

function jsonFrom(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

console.log('static contracts verified');
