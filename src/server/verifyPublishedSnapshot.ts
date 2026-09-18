import { fetchPublishedSnapshot, PUBLISHED_SNAPSHOT_URL } from './publishedSnapshot.js';

const snapshot = await fetchPublishedSnapshot();
if (snapshot.sources.length !== 3) throw new Error('published snapshot must contain three sources');
process.stdout.write(`verified ${snapshot.sources.length} sources at ${PUBLISHED_SNAPSHOT_URL}\n`);
