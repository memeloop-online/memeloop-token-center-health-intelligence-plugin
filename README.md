# MTC 模型健康与能力

`mtc-health-intelligence` 是 MemeLoop Token Center 的官方 TypeScript 插件示例。安装后，它在 Operator 的“监控”分类注册“模型健康与能力”页签，将三个公开来源汇总为一个类型化数据视图：

- [Codex Radar](https://codexradar.com/)：综合 IQ 与样本量。
- [DeepSWE](https://deepswe.datacurve.ai/)：软件工程任务通过率与 Agent 步数。
- [CDK 模型健康](https://cdk.aixhan.com/model-health)：模型服务状态、响应延迟与最近检查时间。

浏览器通过 MTC 的插件数据端点读取规范化 JSON。`typed_data_v1` 与 `health_intelligence_v1` 由 MTC 核心渲染，自动沿用 Operator 的布局、状态、排版、主题和响应式设计。插件安装后由运行时清单注册页签，无需重新构建 MTC Web。

## 数据流

```text
公开 JSON 来源
  -> 固定 HTTPS 来源与路径校验
  -> 超时、重试、响应体上限、缓存
  -> TypeScript 规范化与字段裁剪
  -> /api/health-intelligence 类型化快照
  -> MTC service_data 代理
  -> Operator“模型健康与能力”页签
```

根目录的 [`plugin.json`](plugin.json) 使用当前 MTC 清单契约：

- 插件 ID：`mtc-health-intelligence`
- 数据贡献：`contributions.service_data[0]`
- Operator 贡献：`contributions.operator_ui[0]`
- 分类：`monitoring`
- 路由：`health-intelligence`
- 渲染器：`typed_data_v1`
- 呈现：`health_intelligence_v1`
- 权限：`metrics:read`

清单中的服务地址为：

```text
https://memeloop-online.github.io/memeloop-token-center-health-intelligence-plugin/api/health-intelligence.json
```

GitHub Pages 工作流每十分钟生成一次快照。单个来源短暂失败时沿用上一版规范化记录并标记为 `stale`，其余来源继续更新；首次采集失败的来源标记为 `error`。

仓库管理员首次发布前在 Pages 设置中选择 **GitHub Actions** 作为发布源。合并到 `master` 后，`publish health intelligence API` 工作流会更新上述地址。

## 安装

手动 `publish plugin` 工作流发布 manifest-only 的签名 OCI 插件包：

```text
ghcr.io/memeloop-online/memeloop-token-center-health-intelligence-plugin@sha256:<published-digest>
```

发布前工作流会验证 Pages API、当前 MTC 清单契约和固定安装器信任；发布后使用官方 `install-plugin-oci` 对签名字节执行干净重装。安装并刷新插件清单后，“模型健康与能力”会出现在 Operator 的“监控”分类。

## API 契约

响应结构由 [`schemas-health-intelligence.json`](schemas-health-intelligence.json) 定义：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-09-18T11:00:00.000Z",
  "sources": [
    { "id": "codexradar", "status": "ok", "rows": [] },
    { "id": "deepswe", "status": "ok", "rows": [] },
    { "id": "aixhan", "status": "ok", "rows": [] }
  ]
}
```

每个来源包含固定的 `pageUrl` 与 `endpoint`、采集时间、来源更新时间、状态、尝试次数和最多 24 条规范化记录。快照只保留供 Operator 展示的规范化字段。

服务也可以作为常驻 Node 进程运行：

```text
npm ci --ignore-scripts
npm run build
PORT=8080 npm run serve
```

常驻服务提供 `GET /api/health-intelligence`。同一 `SnapshotService` 同时用于常驻服务与 Pages 快照，因此两种部署方式共享来源约束和类型化输出。

## 边界

来源列表位于 [`src/server/sources.ts`](src/server/sources.ts)，请求前由 [`src/server/security.ts`](src/server/security.ts) 校验：

- 三个已审查的 HTTPS origin 与固定路径构成来源清单。
- 请求采用固定 User-Agent、无浏览器会话的公开读取方式，并直接读取来源端点。
- 单次请求超时 4 秒，瞬态失败最多重试两次。
- JSON 响应上限为 2 MiB，`robots.txt` 上限为 64 KiB。
- 内存缓存有效期为 5 分钟；刷新失败时可返回上一次规范化数据并标记为 `stale`。
- Operator 接收稳定的错误分类，便于展示和筛选。

## 开发与验证

CI 使用 Node 24，执行：

```text
npm ci --ignore-scripts
npm run check
node scripts/verify-static.mjs <pinned-mtc-source> <pinned-installer-source>
```

单元测试只读取 `test/fixtures`。清单校验固定到 MTC `d5598638654fab18b91ae2067b7d5ae11e81ae29`，发布校验同时读取签名安装器对应的源码契约，覆盖 `service_data`、运行时 Operator 页签注册、`typed_data_v1`、`health_intelligence_v1` 与服务数据 JSON Schema 子集。真实来源采集仅在 Pages 发布工作流执行。
