# Health service-data runtime contract

The current release still declares the Pages HTTP snapshot. This reference API
prepares component collection; it does not publish a Wasm collector or switch
the installed manifest.

## Configuration and authority

`createRuntimeCollector(config, authority, fetch)` is exported from the server
package. `config.sources` is required and nonempty, with no implicit three-source
registry. Each source declares ID, label, HTTPS page/data/robots URLs, exact data
path, observation lifetime, and one versioned normalizer: `codexradar_v1`,
`deepswe_v1`, or `aixhan_v1`. Unknown selectors fail closed.

Authority comes from the verified manifest, never browser or tenant input.
Plugin/endpoint identity is `mtc-health-intelligence` / `health-intelligence`.
Every configured origin must already be in the signed HTTP capability.
Configuration cannot grant network authority. Page, data and robots URLs share
an origin; credentials, queries, fragments and redirects are rejected. Robots
denial/unavailability blocks data collection.

The injected transport receives public GET requests, fixed Accept/User-Agent,
omitted credentials, and an abort signal. Operator tokens, tenant secrets,
provider credentials and OAuth state cannot enter configuration or headers.
DNS pinning and public-destination enforcement remain host responsibilities.

## Isolation, timeout and failure cache

Each collector owns its registry, in-flight work, last-good data and negative
cache. Recreate it on configuration/authority revision; never reuse it between
tenant-specific feeds. Public global source records contain no tenant data.
Host durable cache identity includes runtime revision, plugin ID, endpoint ID
and endpoint contract revision. Every API read checks `plugins:read`, endpoint
`metrics:read`, and the service tenant restriction before reading cache. API
responses are private/no-store; service credentials never travel upstream.

Runtime transport uses a 4000 ms per-request timeout, zero automatic retries,
and 1 MiB data body cap. Success caches for 300 seconds. Failure caches for 30
seconds, including forced reads; concurrent reads share work. Failure retains
last-good rows and original timestamps as stale. Without last-good data it
returns error/empty rows. Recovery clears negative cache. Private transport
exception text is discarded.

The UI verifies plugin/endpoint provenance and propagates host stale/unavailable
state even if embedded records say `ok`. Refresh reads cache; it does not execute
collection, bypass backoff or refresh successful collection timestamps.

The pinned host `4c3cb9acb06f86cfdcdfd319b1cfcf1cd924fbdc` omits
`provenance.freshness`. Its `partial`, `source` and millisecond `fetched_at`
fields remain supported: network/cache success displays its records, partial or
stale-cache results retain records as stale, and manifest fallback is unavailable.
Legacy collection times older than twenty minutes or beyond the existing clock
skew allowance downgrade to stale. Explicit modern freshness takes precedence
over this legacy inference; identity checks apply to both response shapes.

## Existing ABI and remaining integration

The host already supports `memeloop:token-center@0.2.0`, world
`service-data-plugin`, with `service-data-v1.collect(collector-id, config-json)`
and `normalize(normalizer-id, config-json, collected-json)`. Manifest endpoint
`component` selects collector/normalizer/config. Host HTTP returns an envelope
with status, headers and `body_base64`. Collect and normalize share one host
execution deadline and body cap. No additional host API or SDK major is needed.

The current Operator SDK exposes cache reads/navigation. It cannot run this
TypeScript collector in the worker or authorize arbitrary external fetches.
Remaining plugin work: compile an existing-WIT component, decode host transport
envelopes, and switch the signed manifest to component collection with approved
origins. The total budget must include robots, data and normalization; Node's
per-request timeout does not establish that budget. Existing CI checks this
reference contract/UI, not component execution, signed runtime installation,
pre-release acceptance or production readiness. Keep the signed installation
unchanged until those separate checks pass.
