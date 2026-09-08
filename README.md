# Health and intelligence · Token Center example plugin

This repository is a self-contained TypeScript service-plugin example for
Token Center. It contributes a **Health and intelligence** tab to the core
**Monitoring** category and serves one normalized, typed snapshot built from
three public sources. The manifest follows the product operator-contribution
v1 contract at product commit
`8febaf59e06f06f212cf8f01776455276c60380a`.

The core owns the browser renderer. `typed_data_v1` means that Token Center
fetches the named service-data feed through
`/internal/v1/plugins/{plugin_id}/data/{endpoint_id}` and renders validated JSON
locally. The manifest has no plugin JavaScript entry, remote HTML, stylesheet,
iframe, credential passthrough, or arbitrary navigation. The optional
TypeScript preview under `src/client` is for local review of the same typed
snapshot only; it is not referenced by `plugin.json` and is excluded from the
packaged plugin artifact.

The service URL in this un-deployed candidate is the reserved placeholder
`https://health-intelligence.example.invalid/api/health-intelligence`. Replace
that URL and its matching HTTP capability origin with the HTTPS origin of the
approved service deployment before installing the plugin. This repository does
not deploy that service.

The upstream data is informational. It is not a Token Center measurement or
an official endorsement by Token Center, Memeloop, Codex Radar, Datacurve, or
AixHan, and it must not be treated as a service-level commitment. A source can
be stale, incomplete, or unavailable.

## Core v1 manifest

`plugin.json` uses the final core namespaces and closed enums:

```json
{
  "contributions": {
    "service_data": [{
      "id": "health-intelligence",
      "url": "https://health-intelligence.example.invalid/api/health-intelligence",
      "required_scope": "metrics:read",
      "response_schema": "inline object-root normalized snapshot schema",
      "fallback": "schema-valid three-source error snapshot",
      "cache_ttl_seconds": 300,
      "timeout_millis": 4000,
      "max_body_bytes": 1048576
    }],
    "operator_ui": [{
      "id": "health-and-intelligence",
      "slot": "operator.sidebar.tab",
      "category": { "id": "monitoring" },
      "route": "health-intelligence",
      "label": "Health and intelligence",
      "icon": "heart",
      "renderer": "typed_data_v1",
      "presentation": "health_intelligence_v1",
      "data_endpoint": "health-intelligence"
    }]
  }
}
```

The full response schema and fallback are inline in the manifest, as required
by the core loader; the checked-in
[`schemas-health-intelligence.json`](schemas-health-intelligence.json) is the
same object-root schema for review and tooling. The adapter in
[`src/manifestAdapter.ts`](src/manifestAdapter.ts) validates the exact IDs,
route, Monitoring category, icon, renderer, endpoint linkage, placeholder URL,
scope, and bounded service limits. It explicitly rejects the former
`contributions.ui.tabs` executable-entry shape.

Contract decisions now aligned with core:

| Contract field | This plugin |
| --- | --- |
| `contributions.service_data` | One aggregate normalized feed named `health-intelligence` |
| `contributions.operator_ui` | One `operator.sidebar.tab` in core category `monitoring` |
| `data_endpoint` | Same-plugin service-data ID; never a browser URL |
| `renderer` | Core-owned `typed_data_v1` |
| `presentation` | Closed core-owned `health_intelligence_v1` view; no plugin browser code |
| `required_scope` | Existing `metrics:read` read scope |
| Service limits | 300-second cache, 4-second timeout, 1 MiB body cap |
| Fallback | Schema-valid snapshot with all three sources marked unavailable |
| Capability origins | Aggregate service placeholder plus the three reviewed upstream origins |

## Public sources and boundaries

The service reads these fixed public endpoints:

- [Codex Radar](https://codexradar.com/) —
  `https://codexradar.com/api/radar-insights` (`comprehensive_points`).
- [DeepSWE](https://deepswe.datacurve.ai/) —
  `https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json` (`rows`).
- [AixHan model health](https://cdk.aixhan.com/model-health) —
  `https://cdk.aixhan.com/api/public/check-cx/dashboard`
  (`providerTimelines`).

Both source pages and data endpoints are fixed in `src/server/sources.ts`.
Immediately before every outbound request,
`src/server/security.ts` requires HTTPS and an exact origin from the three-item
upstream allowlist. It rejects credentials, query strings, fragments,
alternate hosts, and redirects. Requests are GET-only with
`credentials: omit`; no cookie, API key, authorization header, or other secret
is accepted or sent.

The service checks each source's `robots.txt` before requesting data. A
wildcard `Disallow` wins by longest path match, with equal-length `Allow`
taking precedence. Missing `robots.txt` is treated as having no directives;
an unreadable policy fails closed. Robots text is policy input only and never
crosses the service-data boundary. The service does not fetch or render
upstream HTML and does not proxy arbitrary URLs.

Every source request has a 4-second timeout, at most two retries for transient
network/408/425/429/5xx failures, bounded backoff, a 2 MiB decoded body cap
(64 KiB for robots), and an in-memory five-minute cache. A failed refresh keeps
the last normalized value as `stale`; without a previous value that source is
`error`. Other sources continue rendering. Raw upstream payloads and response
bodies never cross the typed service-data response.

## Typed snapshot and preview

`src/shared/types.ts` is the only server/preview data contract. It contains
source identity, page and endpoint attribution, fetch time, source freshness,
attempt count, bounded error classification, and normalized rows for all three
sources. No credentials, upstream HTML, arbitrary URL, or raw payload field is
part of that contract.

The host adapter exposes a fixed local deployment route,
`GET /api/health-intelligence`, for the service process. The optional preview
client requests that route, validates the typed snapshot at runtime, and draws
three compact source cards with `textContent` and fixed public links. The core
installation does not load this preview bundle: it calls the manifest-declared
service feed and uses its own typed-data renderer.

## Development and tests

Node 22 or newer and official npm are required:

```text
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

Tests use only checked-in fixtures under `test/fixtures`; CI never calls a
real public site. They cover normalization, typed decoding, exact-origin and
robots checks, timeout/retry/body bounds, cache and stale data, partial
failure, the fixed service route, the final core manifest adapter, and the
schema-valid fallback shape.

The workflow runs on the public free GitHub runner for `master` pushes and
pull requests, uses official npm, SHA-pinned official GitHub Actions, and
uploads the versioned `npm pack` output as an immutable SHA-named artifact.
It performs no registry publish, deployment, or secret injection.
