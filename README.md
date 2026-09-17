# MTC Transient Health / MTC 瞬态健康策略

Official, installable MemeLoop Token Center (`MTC`) health-policy plugin for
`group-routing-v2`. It is a Rust WebAssembly component, not a JavaScript service
or remote dashboard. The package preserves the host's already-authorized
candidate order and contributes bounded transient-failure opening and recovery
policy only.

MemeLoop Token Center 官方可安装的 `group-routing-v2` 健康策略插件。它是 Rust
WebAssembly component，不是 JavaScript 服务或远程页面。插件严格保留宿主已经授权的
候选顺序，只提供有界的瞬态失败熔断与恢复策略。

## Security and authority boundary / 安全与权限边界

- The manifest declares `group-routing-v2` with `health_policy: plugin` and an
  executable `plugin.wasm`.
- Capabilities are empty. The component receives no credential, prompt, request
  body, network, KV, clock, or account-discovery access.
- The result is an exact permutation of host-authorized identities. It cannot
  add an account, grant a route, revive hard quota/authentication state, replay
  a request, or extend the host deadline.
- MTC owns signal persistence, credential-generation fencing, exclusive probe
  leases, terminal sampling, hard recovery, and the final validation of every
  directive. The component supplies policy thresholds and bounded delay advice.
- Unknown fields, duplicate candidates, cross-tenant identities, invalid EWMA
  values, and out-of-range policy values fail closed.

- Manifest 明确声明 `group-routing-v2` 与 `health_policy: plugin`，并包含可执行
  `plugin.wasm`。
- capabilities 为空；组件无法访问凭证、提示词、请求正文、网络、KV、时钟或账号发现。
- 输出必须是宿主已授权身份的精确排列；不能新增账号、扩大路由授权、恢复硬额度/认证
  状态、重放请求或延长宿主 deadline。
- 信号持久化、凭证代际隔离、独占探针租约、终态采样、硬状态恢复和指令终检都由 MTC
  核心负责；插件只返回策略阈值和有界延迟建议。
- 未知字段、重复候选、跨租户身份、非法 EWMA 或越界策略值都会 fail closed。

## Compatibility / 兼容性

This release targets MTC source revision
[`76d0a5e9dd9788b486f3e053d740596d7da80a3d`](https://github.com/memeloop-online/memeloop-token-center/commit/76d0a5e9dd9788b486f3e053d740596d7da80a3d),
which introduced the durable `group-routing-v2` signal contract. The WIT package
remains `memeloop:token-center@0.2.0`; v2 fields travel through the independent
`group-routing-plugin` JSON ABI. The vendored
[`wit/token-center.wit`](wit/token-center.wit) must remain byte-identical to the
pinned host revision.

本版本依赖上述 MTC core revision 提供的持久化 `group-routing-v2` 信号契约。WIT
包版本仍为 `0.2.0`；v2 字段通过独立 `group-routing-plugin` JSON ABI 传递。本仓库不
包含主仓库迁移工具、数据库迁移或部署配置。

## Release and installation / 发布与安装

The manual `publish` GitHub Actions workflow builds and tests the component,
publishes the exact `plugin.json` and `plugin.wasm` as MTC OCI media types,
captures the registry digest, signs that digest with GitHub OIDC/Cosign, verifies
the exact workflow identity, then reinstalls the signed digest with MTC's
official digest-pinned installer. Publication fails closed if OIDC, package
write access, the workflow token, the reviewed installer digest, signature
verification, manifest validation, or byte-for-byte reinstall comparison is
unavailable. No signing key or fallback secret is checked into this repository.

手动 `publish` workflow 会构建并测试组件，以 MTC OCI media type 发布精确的
`plugin.json` 与 `plugin.wasm`，取得 registry digest 后使用 GitHub OIDC/Cosign
签名并校验精确 workflow identity，最后用 MTC 官方 digest-pinned installer 回装。
OIDC、包写权限、workflow token、受审 installer digest、签名校验、manifest 校验或
逐字节回装任一步不可用时都会失败关闭；仓库不保存签名私钥或伪造 secret。

Use only the digest reference recorded in a successful workflow's
`plugin-release.json` evidence:

```text
ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin@sha256:<published-digest>
```

The trusted keyless identity is:

```text
https://github.com/memeloop-online/memeloop-token-center-health-intelligence-plugin/.github/workflows/publish.yml@refs/heads/master
```

For an operator-managed filesystem inventory, invoke the reviewed installer
image from [`release/mtc-installer-trust.json`](release/mtc-installer-trust.json)
and keep both installer and plugin references digest-pinned:

```bash
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=32m \
  --mount type=bind,src=/absolute/operator/plugin-root,dst=/plugins \
  --entrypoint /usr/local/bin/install-plugin-oci \
  ghcr.io/memeloop-online/memeloop-token-center-plugin-installer@sha256:3762012f35acf9151b4aa49a52565be882d016da64d6b368bf901adb8985121e \
  ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin@sha256:<published-digest> \
  --plugin-dir /plugins \
  --allowed-source ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin \
  --cosign-certificate-identity https://github.com/memeloop-online/memeloop-token-center-health-intelligence-plugin/.github/workflows/publish.yml@refs/heads/master \
  --cosign-certificate-oidc-issuer https://token.actions.githubusercontent.com
```

If registry authentication is required, mount operator-managed username and
token files and use the installer's `--registry-username-file` and
`--registry-password-file` flags. Never put credentials in the OCI reference,
manifest, strategy configuration, shell history, or repository.

如 registry 需要认证，请挂载由运维管理的用户名/token 文件，并使用 installer 的
`--registry-username-file` 与 `--registry-password-file`；不要把凭证写入 OCI 引用、
manifest、策略配置、shell history 或仓库。

## Bind to a group / 绑定到组

Installation makes the strategy available but does not activate it. In the MTC
operator UI, open a Provider Group or Route Group, select
`mtc-transient-health`, review the generated configuration form, leave
`transient_health_mode` as `shadow` for initial observation, set routing
priority, and save with the current group/strategy versions. Binding never
changes group membership or authorization.

安装只让策略可选，不会自动启用。请在 MTC 运维界面的 Provider Group 或 Route Group
中选择 `mtc-transient-health`，审核自动生成的配置表单，首次绑定保持
`transient_health_mode: shadow`，设置 routing priority，并使用当前 group/strategy
版本保存。绑定不会改变组成员或授权。

The equivalent API is `PUT` on either
`/internal/v1/provider-groups/{group_id}/routing-strategy` or
`/internal/v1/route-groups/{group_id}/routing-strategy`. Read the group first and
substitute its real concurrency values; do not copy the placeholders below:

```json
{
  "tenant_external_id": "TENANT_EXTERNAL_ID",
  "expected_updated_at": 0,
  "expected_strategy_version": 0,
  "routing_priority": 10,
  "routing_strategy": {
    "plugin_id": "mtc-transient-health",
    "config": {
      "transient_health_mode": "shadow",
      "min_samples": 2,
      "open_micros": 900000,
      "recover_micros": 600000,
      "min_probe_successes": 2,
      "cooldown_ms": 5000,
      "recovery_wait_ms": 1000,
      "recheck_ms": 100
    }
  }
}
```

Send `routing_strategy: null` with fresh concurrency values to unbind and return
that group to native routing. A `409` means the group changed; reread it and make
an explicit retry.

使用新的并发版本把 `routing_strategy` 设为 `null` 可解绑并恢复该组原生路由。收到
`409` 表示组已变化，应重新读取后显式重试。

## Policy / 策略

| Field / 字段 | Default / 默认 | Meaning / 含义 |
| --- | ---: | --- |
| `transient_health_mode` | `shadow` | `shadow` keeps core behavior while evaluating signals; only explicit `active` enables threshold control. / shadow 只观测；显式 active 才启用阈值控制。 |
| `min_samples` | `2` | Minimum conclusive samples before the EWMA may open the breaker. / EWMA 可触发熔断前的最少确定样本。 |
| `open_micros` | `900000` | Open when failure EWMA reaches 0.90 after `min_samples`. / 满足样本数且失败 EWMA 达 0.90 时打开。 |
| `recover_micros` | `600000` | Recovery requires EWMA at or below 0.60. Must not exceed `open_micros`. / 恢复要求 EWMA ≤ 0.60，且不得高于打开阈值。 |
| `min_probe_successes` | `2` | Required consecutive successful probes before core recovery. / core 恢复前需要的连续成功探针数。 |
| `cooldown_ms` | `5000` | Cooldown between transient attempts/probes, capped at 60 seconds. / 瞬态尝试或探针间冷却，最多 60 秒。 |
| `recovery_wait_ms` | `1000` | Maximum wait within the original request deadline; never replenishes budget. / 原请求 deadline 内最大等待，不补充预算。 |
| `recheck_ms` | `100` | Bounded recheck interval; accepted range 25–5000 ms. / 有界重检间隔，范围 25–5000 ms。 |

MTC records conclusive success as `0` and transient failure as `1,000,000`,
using an integer EWMA with alpha `1/4`. Hard quota, authentication, and cancelled
outcomes are not transient samples. In active mode the host—not the guest—opens
the breaker only after the configured sample/threshold condition, and keeps a
half-open account fenced until both recovery conditions pass.

MTC 把确定成功记为 `0`、瞬态失败记为 `1,000,000`，使用 alpha=`1/4` 的整数
EWMA。硬额度、认证失败和取消不属于瞬态样本。active 模式下仍由宿主而不是 guest
执行熔断；只有满足样本/阈值条件才打开，并在两个恢复条件都通过前保持 half-open
隔离。

## Repository layout / 仓库结构

- `src/lib.rs`: strict group-routing-v2 policy and unit tests.
- `wit/token-center.wit`: WIT pinned to the compatible MTC core revision.
- `plugin.json`: installable manifest and operator-rendered policy schema.
- `.github/workflows/ci.yml`: remote tests, component build, WIT pin check, and
  Wasm component validation.
- `.github/workflows/publish.yml`: digest publication, keyless signing, official
  installer reinstall, manifest/receipt verification, and release evidence.
- `release/mtc-installer-trust.json`: reviewed official installer digest and
  compatible core revision.

This repository intentionally contains no service deployment, internal domain,
production identity, live operations data, database migration, or main-repository
migration tooling.

本仓库刻意不包含服务部署、内部域名、生产身份、实时运维数据、数据库迁移或主仓库
迁移工具。
