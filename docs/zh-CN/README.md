# MTC 模型健康与能力

[English](../../README.md)

安装后，插件在 Operator「监控」中添加「模型健康与能力」页签，展示 Codex Radar、DeepSWE 和 CDK 模型健康的公开数据。来源名称、采集时间、观测时间和结果集中呈现。

## 安装与使用

从 GitHub Release 获取签名 OCI 引用，通过 MTC 官方安装器安装。界面使用宿主提供的 React、Fluent 组件和设计主题，跟随 Operator 切换语言与亮暗模式。运行环境需要支持 `component_v1`。

## 来源与时效

Pages 每十分钟采集公开 JSON。界面根据绝对时间每三十秒更新时效状态；采集结果超过二十分钟后显示「数据偏旧」。每个来源还可设置观测结果的有效时长。刷新失败时继续展示上次成功采集的记录及其时间。

## 扩展来源

在 `src/server/sources.ts` 注册来源 ID、名称、HTTPS 地址、观测有效时长和字段转换函数。新来源自动进入 API 列表与页签，数据结构采用带 `key` 的标量字段记录。来源注册表负责校验 ID 唯一性与地址所属域名。

## 发布

CI 执行类型检查与固定数据测试。发布工作流复用同次构建的采集器、Pages 快照及签名 OCI 包，生成 GitHub Release 下载包、校验和与签名凭据。

采用 [Apache License 2.0](../../LICENSE)。
