# MTC Model Health & Intelligence

[中文](docs/zh-CN/README.md)

A signed MemeLoop Token Center plugin that brings public model health and benchmark feeds into the Operator's Monitoring section.

The included sources are [Codex Radar](https://codexradar.com/), [DeepSWE](https://deepswe.datacurve.ai/), and [CDK Model Health](https://cdk.aixhan.com/model-health). Each source shows its observation time, collection time, status, and normalized results.

## Install

Use the OCI reference from the [latest GitHub Release](https://github.com/memeloop-online/memeloop-token-center-health-intelligence-plugin/releases). MTC's official installer verifies its signature and installs the UI module and manifest together. The `component_v1` interface uses the host's React, Fluent components, and theme tokens. Chinese and English follow the operator locale.

Requires MTC's signed `component_v1` runtime. The exact tested host and installer are listed in [release/installer-trust.json](release/installer-trust.json).

## Data API

[Public snapshot](https://memeloop-online.github.io/memeloop-token-center-health-intelligence-plugin/api/health-intelligence.json) · [JSON Schema](schemas-health-intelligence.json)

Pages collects public JSON feeds every ten minutes. Each snapshot contains an open `sources` list. Source entries have `id`, `label`, `pageUrl`, `endpoint`, `fetchedAt`, `sourceUpdatedAt`, `maxObservationAgeSeconds`, `status`, and flat scalar `rows`.

The view calculates freshness from absolute timestamps every thirty seconds. Fetches older than twenty minutes appear as stale; each source also defines its observation lifetime. Collection failures retain the last successful records with a stale status.

## Add a source

Add one definition to [src/server/sources.ts](src/server/sources.ts): a stable ID, label, HTTPS page/data/robots URLs, observation lifetime, and normalizer. `createSourceRegistry` validates unique IDs and matching origins. Custom deployments can pass a source list to `SnapshotService`.

The schema and UI accept new source IDs and flat scalar row fields. Existing benchmark fields have localized labels and number formats; additional fields display their declared names. Supply focused payload fixtures alongside a new normalizer.

## Run and publish

CI installs the lockfile and runs type checking, fixture tests, and the collector build. The `publish plugin` workflow builds once, collects the Pages snapshot, signs the OCI package, and verifies an installation with the official MTC installer. GitHub Release archives reuse those package and snapshot bytes and include checksums and signature evidence.

The same collector supports a Node service through `npm run serve`, exposing `GET /api/health-intelligence`. Source fetches have a four-second timeout, two retries, and a five-minute memory cache.

Licensed under [Apache License 2.0](LICENSE).
