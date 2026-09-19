import { fetchPublishedSnapshot, PUBLISHED_SNAPSHOT_URL } from './publishedSnapshot.js';

const snapshot = await fetchPublishedSnapshot();
if (snapshot.sources.length === 0) throw new Error('published snapshot needs source entries');
process.stdout.write(`verified ${snapshot.sources.length} sources at ${PUBLISHED_SNAPSHOT_URL}\n`);
