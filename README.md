# MTC Transient Health

`mtc-transient-health` is the official transient-health routing policy for
MemeLoop Token Center (`MTC`) `group-routing-v2`. It ships as a Rust WebAssembly
component and preserves the authorized candidate order supplied by MTC.

The policy gives MTC bounded settings for transient-failure opening, probes,
cooldown, and recovery. MTC core stores health evidence, manages credential
generations and probe leases, and validates every directive before routing.

## Install

The signed OCI package is published from the manual
[`publish`](.github/workflows/publish.yml) workflow. Use the digest reference
recorded in its `plugin-release.json` artifact:

```text
ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin@sha256:<published-digest>
```

Install that reference with the MTC plugin installer. The same release artifact
records the installer digest and signature identity used for verification.

## Enable the policy

1. Open a **Provider Group** or **Route Group** in the MTC operator UI.
2. Select `mtc-transient-health` as the routing strategy.
3. Keep `transient_health_mode` set to `shadow` during the first observation
   period.
4. Review the evidence, set the routing priority, and save the group.
5. Change `transient_health_mode` to `active` when the group is ready to apply
   the configured thresholds.

`shadow` is the default. It records bounded evidence while MTC keeps its current
health behavior. `active` applies the configured thresholds through MTC core.

The equivalent API is `PUT` on either:

- `/internal/v1/provider-groups/{group_id}/routing-strategy`
- `/internal/v1/route-groups/{group_id}/routing-strategy`

Read the group first and use its current concurrency values:

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
      "transient_health_window_ms": 60000,
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

## Policy settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `transient_health_mode` | `shadow` | `shadow` records evidence; `active` applies the thresholds. |
| `transient_health_window_ms` | `60000` | Aligned evidence window managed by MTC, from 1 to 300 seconds. |
| `min_samples` | `2` | Conclusive samples required before opening. |
| `open_micros` | `900000` | Opens at a failure EWMA of 0.90 after the sample requirement is met. |
| `recover_micros` | `600000` | Recovery threshold of 0.60; this value stays at or below `open_micros`. |
| `min_probe_successes` | `2` | Consecutive successful probes required for recovery. |
| `cooldown_ms` | `5000` | Delay between transient attempts or probes. |
| `recovery_wait_ms` | `1000` | Maximum recovery wait within the original request deadline. |
| `recheck_ms` | `100` | Interval between recovery checks. |

MTC records a conclusive success as `0` and a transient failure as `1,000,000`,
using an integer EWMA with alpha `1/4`. Quota, authentication, and cancellation
outcomes follow their dedicated MTC health paths. In active mode, MTC opens the
breaker after the sample and threshold conditions are met and restores a
half-open account after both recovery conditions pass.

## Roll back

Set `routing_strategy` to `null` with the group's current concurrency values.
The group immediately returns to native routing. A `409` response indicates a
newer group version; read the group again and submit the updated version.

## Development

Compatibility is pinned to the MTC contract merged in
[`#326`](https://github.com/memeloop-online/memeloop-token-center/pull/326) at
revision `48465eaf751ef479122ac262806a22ada15c37eb`. Active mode uses migration
104 (`transient_health_signal_windows`) and the short-window runtime. The
vendored [`wit/token-center.wit`](wit/token-center.wit) matches that host
revision, while the v2 fields use the `group-routing-plugin` JSON ABI.

CI builds and validates the component. The publish workflow signs the OCI
digest with GitHub OIDC/Cosign and verifies a clean reinstall with the official
MTC installer. Installer compatibility is recorded in
[`release/mtc-installer-trust.json`](release/mtc-installer-trust.json).

---

## 中文

`mtc-transient-health` 是 MemeLoop Token Center（`MTC`）官方提供的
`group-routing-v2` 瞬态健康路由策略。它以 Rust WebAssembly 组件交付，并完整保留
MTC 提供的已授权候选顺序。

该策略向 MTC 提供瞬态失败熔断、探针、冷却和恢复参数。健康证据、凭证代际、探针租约
和指令校验均由 MTC 核心管理。

### 安装

签名 OCI 包由手动 [`publish`](.github/workflows/publish.yml) 工作流发布。安装时使用
`plugin-release.json` 制品中记录的 digest 引用：

```text
ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin@sha256:<published-digest>
```

通过 MTC 插件安装器安装该引用。发布制品同时记录验证所用的安装器 digest 和签名身份。

### 启用策略

1. 在 MTC 运维界面打开 **Provider Group** 或 **Route Group**。
2. 选择 `mtc-transient-health` 路由策略。
3. 首个观测周期保持 `transient_health_mode: shadow`。
4. 查看观测证据，设置路由优先级并保存。
5. 准备应用阈值时，将 `transient_health_mode` 改为 `active`。

默认模式为 `shadow`，用于记录有界证据并保持当前健康行为。`active` 通过 MTC 核心应用
配置中的阈值。

API 配置使用以下任一 `PUT` 端点：

- `/internal/v1/provider-groups/{group_id}/routing-strategy`
- `/internal/v1/route-groups/{group_id}/routing-strategy`

提交前先读取组，并使用当前并发版本。请求体结构参见上方示例。

### 策略参数

| 参数 | 默认值 | 用途 |
| --- | ---: | --- |
| `transient_health_mode` | `shadow` | `shadow` 记录证据；`active` 应用阈值。 |
| `transient_health_window_ms` | `60000` | MTC 管理的对齐证据窗口，范围为 1 至 300 秒。 |
| `min_samples` | `2` | 触发熔断前要求的确定样本数。 |
| `open_micros` | `900000` | 满足样本要求后，失败 EWMA 达到 0.90 时打开熔断。 |
| `recover_micros` | `600000` | 恢复阈值为 0.60，取值需小于或等于 `open_micros`。 |
| `min_probe_successes` | `2` | 恢复前要求的连续成功探针数。 |
| `cooldown_ms` | `5000` | 瞬态尝试或探针之间的等待时间。 |
| `recovery_wait_ms` | `1000` | 原请求截止时间内的最大恢复等待。 |
| `recheck_ms` | `100` | 两次恢复检查之间的间隔。 |

MTC 将确定成功记为 `0`，将瞬态失败记为 `1,000,000`，并使用 alpha=`1/4` 的整数
EWMA。额度、认证和取消结果进入各自的 MTC 健康处理路径。启用模式下，样本与阈值条件
满足后打开熔断；两项恢复条件均满足后恢复 half-open 账号。

### 回滚

携带组的当前并发版本，将 `routing_strategy` 设为 `null`。组会立即恢复原生路由。
收到 `409` 时，重新读取组并提交最新版本。

### 开发说明

兼容契约固定到 MTC
[`#326`](https://github.com/memeloop-online/memeloop-token-center/pull/326) 合并版本
`48465eaf751ef479122ac262806a22ada15c37eb`。启用模式使用 migration 104
（`transient_health_signal_windows`）和短窗口运行时。仓库中的
[`wit/token-center.wit`](wit/token-center.wit) 与该宿主版本一致，v2 字段通过
`group-routing-plugin` JSON ABI 传递。

CI 负责构建和验证组件。发布工作流使用 GitHub OIDC/Cosign 签名 OCI digest，并通过
MTC 官方安装器验证安装结果。安装器兼容状态记录在
[`release/mtc-installer-trust.json`](release/mtc-installer-trust.json)。
