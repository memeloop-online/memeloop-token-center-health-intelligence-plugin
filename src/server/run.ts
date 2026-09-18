import { SnapshotService } from './fetcher.js';
import { createHealthIntelligenceServer } from './httpServer.js';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const server = createHealthIntelligenceServer({ snapshotService: new SnapshotService() });
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`health intelligence API listening on ${port}\n`);
});

const stop = () => server.close(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
