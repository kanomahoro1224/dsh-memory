# dsh-memory

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的观察式记忆插件，移植自
[pi-observational-memory](https://github.com/elpapi42/pi-observational-memory)。

插件在后台维护一条"记忆账本"：一个三阶段 worker（observer → reflector → dropper）在会话空闲时
持续把对话内容蒸馏成**观察**（observations，带来源 seq 的事实记录）和**反思**（reflections，
带支撑观察的归纳），并在观察池超预算时按覆盖度/相关度淘汰旧观察。压缩时，插件的压缩引擎用
账本投影替换默认的"压缩前上下文摘要"，让被阴影化（shadowed）的历史以结构化记忆的形式保留；
模型还可以随时用 `recall` 工具按 id 取回任意一条记忆及其完整来源事件。

移植自上游 [pi-observational-memory](https://github.com/elpapi42/pi-observational-memory)（Pi 编码代理扩展版），本仓库是面向 dsh 的完整插件实现。

## 工作原理

- **压缩引擎**（`lib/compaction/entry.js`）：`ObservationalMemoryEngine` 子类化官方
  `BasicCompactionEngine`（替换其 `compaction-basic` 行），只 override 官方声明的唯一定制点
  `summarize()`：用账本投影渲染记忆摘要；投影为空时回落默认摘要器。事务、加锁、tool-pairing
  校验、压力/溢出触发全部复用 compaction-basic。
- **后台整合**（`lib/consolidation-trigger.js`）：挂 `agent/created` / `agent/status`（idle）事件，
  单飞运行三阶段 worker。每个 worker 通过 `ctx.llm.stream()` 的多轮工具循环运行，使用与 Pi 版
  逐字一致的提示词。
- **账本**（`lib/ledger/`）：append-only JSON 记录（`om/observations/recorded`、
  `om/reflections/recorded`、`om/observations/dropped`、`om/compaction`），原子写（临时文件 +
  rename），损坏时自动从空账本重启，永不拖垮会话。
- **投影语义**与 Pi 版一致：观察按覆盖边界取舍；反思/淘汰跟随最近一次 full-fold 压缩边界；
  观察池 ≥ `observationsPoolMaxTokens` 时触发 full-fold（全量重折）。

## 安装

### 开发（仓库 checkout，绝对路径）

```sh
git clone https://github.com/kanomahoro1224/dsh-memory
cd dsh-memory
npm install          # 含 --legacy-peer-deps 兜底；npm install 会通过 prepare 自动构建
npm run build        # 已装依赖后可随时手动重建 lib/
```

复制 [`cordis.patch.yml.example`](./cordis.patch.yml.example) 为 `cordis.patch.yml`，把两处
`<ABS>/` 替换为本目录的绝对路径，然后：

```sh
dsh web --patch ./cordis.patch.yml
```

### 正式安装（profile 内）

在 profile 目录（`$DSH_HOME/profiles/<name>/`）的 `package.json` 中加入本包依赖并
`npm install`，然后 patch 里用包名替代绝对路径：

```yaml
- id: compaction-basic
  disabled: true

- insert:
    - id: dsh-memory-engine
      name: 'dsh-memory/engine'
    - id: observational-memory
      name: 'dsh-memory'
      config: { }
```

### 为什么必须 disable 内置的 compaction-basic

dsh 的 patch 机制按行 id 覆盖字段，但 `name`（模块路径）在 patch 里是"期望值守卫"，不能用来
换模块；而两个引擎都会注册 `compaction` 服务，cordis 会拒绝重复注册。官方替换配方因此是
**禁用旧行 + 插入新行**（见 `applyEntryPatches` 的实现与注释）。

`command-compact`（`/compact`）注入的是 `compaction` **服务**而非具体行，禁用替换后无需改动。

## 配置

配置放在插件行（`observational-memory`）上；引擎行可留空。插件行配置会覆盖引擎行配置，
引擎行配置只在插件行省略对应字段时作为回退。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `observeAfterTokens` | `10000` | 自上次观察覆盖点以来新增的估计源 token 达到该值时运行 observer |
| `reflectAfterTokens` | `20000` | 自上次反思覆盖点以来的增量阈值，达到后 reflector 基于观察池产出反思 |
| `observerChunkMaxTokens` | 按记忆模型上下文 × 0.2 推导 | 单个 observer 输入块的上限（估计 token） |
| `observationsPoolMaxTokens` | `20000` | 活跃观察池预算；≥ 该值时下一次压缩走 full-fold |
| `observationsPoolTargetTokens` | 预算的一半 | dropper 把池子往该目标压缩 |
| `agentMaxTurns` | `16` | 单个 worker 的最大工具轮数 |
| `model` | 会话当前模型 | worker 与回退摘要器使用的 `{provider, model, reasoningEffort?}` |
| `thresholdRatio` | `0.68` | 自动压缩触发点（上下文窗口占比），透传给 compaction-basic |
| `retainRatio` / `retainTokens` | compaction-basic 默认 | 压缩保留窗口；`retainTokens` 优先 |
| `summarizationMaxTokens` | compaction-basic 默认 | 回退检查点摘要器的生成上限 |
| `showWorkerNotifications` | `true` | worker 启动/结果的通知（dsh 日志/通知通道） |
| `passive` | `false` | 只替换压缩摘要、停跑全部后台 worker（手动 `/compact` 仍产记忆摘要） |
| `debugLog` | `false` | 写 `.dsh/observational-memory/debug` NDJSON 诊断日志 |

环境变量 `DSH_OBSERVATIONAL_MEMORY_PASSIVE=1|true|yes|on` 可强制被动模式（优先于配置）。

## 命令与工具

| 入口 | 说明 |
| --- | --- |
| `/om-status` | 显示三阶段进度（阈值占比、覆盖锚点、在途状态、最近错误）与账本概况 |
| `/om-view [full]` | 查看记忆：默认为当前可见投影（最近一次压缩摘要携带的内容），`full` 为账本全量投影 |
| `recall` 工具 | 模型按 12 位十六进制 id 取回一条观察/反思，附带来源事件全文（压缩阴影化后仍可取回，读取的是完整 append-only 日志） |

## 数据存储

全部状态在项目工作目录下（会话级、跨重启持久）：

- 账本：`.dsh/observational-memory/sessions/<sessionId>.json`
- 诊断日志：`.dsh/observational-memory/debug/<sessionId>.ndjson`（`debugLog: true` 时）

## 与 Pi 版的差异

- 账本从 Pi 的会话内 custom entry 改为独立 JSON 文件（dsh 的 `Session.append` 无法盖
  `ignorable` 戳）；覆盖锚点相应地从 entry id 改为 session event seq。
- Pi 的绝对阈值 `compactAfterTokens` 换成 dsh 的窗口占比 `thresholdRatio`（透传
  compaction-basic）；`modelPolicies` 等剩余键透传。
- 记忆不再通过 `om.*` custom entry 进入会话日志，仅存于账本与压缩摘要。
- dsh 无 TUI/剪贴板：`/om-view` 为纯文本。
- worker 不设置 `purpose` 字段（dsh 的 purpose 是封闭联合）。
- 压缩事务/边界解析复用 compaction-basic：`summarize()` 通过消息 id 反查表面 seq 定位
  保留边界（`firstKeptSeq`），记录 compaction 时重算投影并附带可见记忆明细。

## 开发

```sh
npm run typecheck   # tsc --noEmit（含 tests）
npm test            # vitest，11 个文件 / 68 个用例
npm run build       # 输出 lib/
```

对 dsh API 的依赖（`agent/status`、`Session.surface`、`tokenMeter.measure`、`commands`、
`tools`、`CompactionEngine` 接缝等）均按 `node_modules` 内 `.d.ts` 与 deepseek-harness-master
源码逐一核对；关键语义（patch 不能换 `name`、schemastery 非严格对象保留未知键、服务重名
抛错）以 vendored cordis 源码为准。
