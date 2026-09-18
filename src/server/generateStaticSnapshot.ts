import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { SnapshotService } from './fetcher.js';
import { fetchPublishedSnapshot } from './publishedSnapshot.js';

const output = resolve(process.argv[2] ?? 'site/api/health-intelligence.json');

async function previousSnapshot() {
  try {
    return await fetchPublishedSnapshot();
  } catch {
    return undefined;
  }
}

const previous = await previousSnapshot();
const snapshot = await new SnapshotService(previous ? { initialSnapshot: previous } : {}).read(true);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
await writeFile(resolve(dirname(output), '..', '.nojekyll'), '', { encoding: 'utf8', mode: 0o644 });
process.stdout.write(`wrote ${snapshot.sources.length} sources to ${output}\n`);
