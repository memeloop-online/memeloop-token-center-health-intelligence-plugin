import type { SourceId } from '../shared/types.js';

export const EXACT_ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://codexradar.com',
  'https://deepswe.datacurve.ai',
  'https://cdk.aixhan.com',
]);

export class PublicBoundaryError extends Error {
  readonly code = 'public_boundary';

  constructor(message: string) {
    super(message);
    this.name = 'PublicBoundaryError';
  }
}

/**
 * Validate an origin at the last possible moment before a request.  The
 * caller must still compare the path with its source's fixed endpoint.  This
 * deliberately rejects credentials, query strings, fragments, non-HTTPS
 * schemes, and any origin outside the three reviewed public sites.
 */
export function assertExactAllowedOrigin(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PublicBoundaryError('endpoint is not a valid URL');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    throw new PublicBoundaryError('endpoint must be HTTPS without credentials');
  }
  if (url.hash !== '') {
    throw new PublicBoundaryError('endpoint must not contain a fragment');
  }
  if (url.search !== '') {
    throw new PublicBoundaryError('endpoint must not contain a query string');
  }
  if (!EXACT_ALLOWED_ORIGINS.has(url.origin)) {
    throw new PublicBoundaryError('endpoint origin is not in the exact public allowlist');
  }
  return url;
}

export interface FixedEndpoint {
  readonly source: SourceId;
  readonly pageUrl: string;
  readonly endpoint: string;
  readonly robotsUrl: string;
}

export function assertFixedEndpoint(endpoint: FixedEndpoint): URL {
  const page = assertExactAllowedOrigin(endpoint.pageUrl);
  const data = assertExactAllowedOrigin(endpoint.endpoint);
  const robots = assertExactAllowedOrigin(endpoint.robotsUrl);
  const expectedOrigin = page.origin;
  if (data.origin !== expectedOrigin || robots.origin !== expectedOrigin) {
    throw new PublicBoundaryError('source page, endpoint, and robots URL must share an exact origin');
  }
  if (robots.pathname !== '/robots.txt' || robots.search !== '') {
    throw new PublicBoundaryError('robots URL must be the origin robots.txt path');
  }
  if (data.search !== '') {
    throw new PublicBoundaryError('data endpoint must not contain a query string');
  }
  return data;
}

export interface RobotsRules {
  readonly kind: 'rules' | 'missing' | 'unavailable';
  readonly sourceUrl: string;
  readonly checkedPath: string;
  readonly allowed: boolean;
}

interface RobotsDirective {
  readonly kind: 'allow' | 'disallow';
  readonly path: string;
}

/**
 * Small RFC 9309-style parser for the user-agent `*` group.  We only need a
 * path decision; comments, unknown directives, and other user-agent groups
 * are ignored.  The longest matching rule wins, with Allow winning ties.
 */
export function parseRobots(text: string, sourceUrl: string, checkedPath: string): RobotsRules {
  const directives: RobotsDirective[] = [];
  let agents: string[] = [];
  let groupHasDirective = false;
  let lines = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    if (++lines > 2_000) break;
    const line = rawLine.split('#', 1)[0]?.trim() ?? '';
    if (!line) {
      if (groupHasDirective) agents = [];
      groupHasDirective = false;
      continue;
    }
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === 'user-agent') {
      if (groupHasDirective) {
        agents = [];
        groupHasDirective = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    groupHasDirective = true;
    if (!agents.includes('*') || (name !== 'allow' && name !== 'disallow')) continue;
    // An empty Disallow means no restriction. Empty Allow is not useful.
    if (value === '') continue;
    if (value.startsWith('/')) {
      directives.push({ kind: name, path: value });
    }
  }

  let best: RobotsDirective | undefined;
  for (const directive of directives) {
    if (!checkedPath.startsWith(directive.path)) continue;
    if (!best || directive.path.length > best.path.length
      || (directive.path.length === best.path.length && directive.kind === 'allow')) {
      best = directive;
    }
  }
  return {
    kind: 'rules',
    sourceUrl,
    checkedPath,
    allowed: best?.kind !== 'disallow',
  };
}

export function robotsUnavailable(sourceUrl: string, checkedPath: string): RobotsRules {
  return { kind: 'unavailable', sourceUrl, checkedPath, allowed: false };
}
