import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FetchLike } from '../src/server/fetcher.js';
import { SOURCE_SPECS } from '../src/server/sources.js';

export function fixture(name: string): unknown {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function fixtureText(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return readFileSync(path, 'utf8');
}

export function fixtureFetch(
  bodies: Partial<Record<'codexradar' | 'deepswe' | 'aixhan', unknown>> = {
    codexradar: fixture('codexradar.json'),
    deepswe: fixture('deepswe.json'),
    aixhan: fixture('aixhan.json'),
  },
  robots = fixtureText('robots/allow-all.txt'),
  statuses: Partial<Record<'codexradar' | 'deepswe' | 'aixhan', number>> = {},
): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetcher: FetchLike = async (input) => {
    const url = String(input);
    calls.push(url);
    const spec = Object.values(SOURCE_SPECS).find((candidate) => url === candidate.endpoint || url === candidate.robotsUrl);
    if (!spec) return new Response('not found', { status: 404 });
    const status = url === spec.endpoint ? statuses[spec.source] ?? 200 : 200;
    if (status !== 200) return new Response('temporary failure', { status });
    if (url === spec.robotsUrl) return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } });
    return new Response(JSON.stringify(bodies[spec.source]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fetcher, calls };
}

export const fixedNow = () => new Date('2026-09-07T16:00:00.000Z');
