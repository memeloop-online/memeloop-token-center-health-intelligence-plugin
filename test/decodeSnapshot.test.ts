import { describe, expect, it } from 'vitest';
import { decodeSnapshot, SnapshotDecodeError } from '../src/server/decodeSnapshot.js';
import { SnapshotService } from '../src/server/fetcher.js';
import { fixtureFetch, fixedNow } from './testUtils.js';

describe('published snapshot decoder', () => {
  it('accepts the normalized three-source contract', async () => {
    const setup = fixtureFetch();
    const snapshot = await new SnapshotService({
      fetch: setup.fetch,
      now: fixedNow,
      sleep: async () => undefined,
      policy: { timeoutMs: 250, retryDelayMs: [0, 0] },
    }).read();
    expect(decodeSnapshot(snapshot, fixedNow().getTime())).toEqual(snapshot);
  });

  it('rejects a row type assigned to the wrong source', async () => {
    const setup = fixtureFetch();
    const snapshot = await new SnapshotService({
      fetch: setup.fetch,
      now: fixedNow,
      sleep: async () => undefined,
      policy: { timeoutMs: 250, retryDelayMs: [0, 0] },
    }).read();
    const invalid = structuredClone(snapshot);
    invalid.sources[0]!.rows = invalid.sources[1]!.rows;
    expect(() => decodeSnapshot(invalid)).toThrow(SnapshotDecodeError);
  });
});
