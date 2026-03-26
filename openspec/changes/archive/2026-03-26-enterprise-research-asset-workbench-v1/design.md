## Context

这个仓库已经有可运行的 browser-first brainstorming product：

- `skills/brainstorming/scripts/server.cjs` 提供 `/app` 和 `/api/*` 接口
- `web-app-shell.html` 已经有工作台式 UI 骨架
- `web-session-manager.cjs` 负责 session、artifact、workflow state 持久化
- `workflow-checkpoint-store.cjs` 和 `workflow-policy.cjs` 已经分别覆盖 checkpoint 和自动化边界

但当前产品的核心对象仍然是“session + generated artifact”。它能把一次 brainstorming 收口成设计文档和实现计划，却不能把研究过程本身沉淀成团队资产。对企业战略 / 战投团队来说，这意味着：

- 研究问题、假设树、证据、判断和结论没有强语义边界
- 发布后的结果不是版本化资产包
- 权限、审计、人工确认和复用边界没有产品级约束

这次 change 要在现有产品骨架上补齐“研究资产工作台”V1 的对象模型、治理模型和 workbench 体验。

## Goals / Non-Goals

**Goals:**

- 复用现有 `/app` workbench，而不是另起一个独立应用。
- 在现有 brainstorming product 中引入一套最小但严格的研究资产对象模型。
- 将 `Workspace` 和 `ResearchAssetBundle` 明确拆分为“可编辑过程”与“不可变发布快照”。
- 让发布、复核、审计、权限和 agent confirmation 有稳定的服务端门禁，而不是只靠 UI 提示。
- 把用户资产运行数据写入产品 data directory，而不是继续混进仓库文档路径。

**Non-Goals:**

- 不做通用 AI workspace、实时多人协作、Presence、多光标编辑。
- 不做企业 SSO / LDAP / AD 对接。
- 不做 SaaS 多租户运营能力。
- 不做重型外部系统编排或广泛文件格式导入平台。

## Decisions

### Decision: 在现有 browser product 上增量演进，而不是新建第二套 workbench

V1 直接扩展现有：

- `server.cjs` 继续做 HTTP/API 入口
- `web-session-manager.cjs` 继续做 session/workflow 编排
- `web-app-shell.html` 继续做主工作台

同时新增专门的 research asset persistence 模块，而不是把所有资产逻辑都塞回 `web-session-manager.cjs`。

**Why this over新建 app?**

- 当前 `/app` 已经是 workbench 样式，具备 session 列表、主区域、右侧预览这些骨架。
- 新建第二套产品会复制 transport、host、tests、dataDir 逻辑，风险和重复劳动都更高。

### Decision: 研究资产使用独立 store，和 session artifact 分层

V1 新增一个 research asset store，负责：

- published asset metadata
- workspace-level asset indexing
- review request persistence
- audit/checkpoint references

`session` 仍然表示一次运行中工作流；`asset` 表示会话沉淀出的长期成果。

**Why this over继续把 asset 混成 session artifact?**

- session 生命周期和 asset 生命周期不同。
- asset 需要索引、版本化、复用和权限控制，这些需求不适合继续隐藏在“artifact preview”字段后面。

### Decision: Workspace 和 ResearchAssetBundle 明确分离

- `Workspace` 是可编辑、可冻结、可退回的研究过程容器
- `ResearchAssetBundle` 是从 `Workspace` 发布出来的不可变版本快照

发布时：

- `Workspace` 进入 `ReadyForPublish`
- 系统执行发布检查清单
- 通过后生成新版本 `ResearchAssetBundle`

后续修改必须：

- 回到 `Workspace`
- 或从已发布资产包克隆出新 `Workspace`

**Why this over发布后继续原地编辑?**

- 企业研究资产的复盘、审计和复用都要求已发布版本不可变。
- 如果发布后还能直接改正文，审计和引用都会失真。

### Decision: 复用现有 checkpoint/policy 模块，但补 research-specific trigger 与 governance semantics

V1 不重写：

- `workflow-checkpoint-store.cjs`
- `workflow-policy.cjs`

而是在研究资产语义上补充：

- `hypothesis_parked_or_superseded`
- `judgment_confirmed_or_superseded`
- `workspace_ready_for_publish`
- `asset_bundle_published`

以及高风险动作的 confirmation boundary：

- evidence verification / acceptance
- publish approval
- export
- cross-team sharing

**Why this over重写一套?**

- 现有模块已经证明了“内部隐藏自动化 + 明确确认边界”的模式有效。
- V1 需要的是研究语义，而不是另一套并行基础设施。

### Decision: V1 只做最小 governance 闭环

V1 权限和协作只覆盖：

- `Owner / Editor / Viewer / Auditor`
- `ReviewRequest` with `evidence-review` / `publish-approval`
- 审计日志最少字段集合

不做：

- 组织身份同步
- 复杂审批流引擎
- 独立通知中心

**Why this over一开始做完整 enterprise platform?**

- 这次 change 的目标是让 workbench 具备可信的企业级资产边界，不是把所有企业功能一次做完。
- 最小 RBAC + request queue + audit 已足够支撑 V1。

### Decision: Published asset snapshot 只带引用过的 accepted evidence 和必要的追溯引用

V1 发布快照包含：

- 单个主 `ResearchQuestion`
- 全部 `Hypothesis / SubQuestion`，包括 `Parked` / `Superseded`
- 被 `Confirmed Judgment` 引用的 `Accepted Evidence`
- `Conclusion / NextStep`
- 版本元数据、publish summary、checkpoint references、audit references

V1 不把以下内容复制进快照正文：

- `Collected` / `Reviewed` / `Rejected` evidence 的正文
- 完整审计日志
- 没有进入结论链路的临时草稿结论

**Why this over完整复制所有运行内容?**

- 完整复制会让 published bundle 变成“整个 session dump”，不利于复用和治理。
- 只保留进入结果链路的 accepted evidence，才能让 bundle 既可追溯又可交付。

## Risks / Trade-offs

- [Risk: `web-session-manager.cjs` 继续膨胀] → Mitigation: 把 asset persistence、review request persistence、audit helpers 拆到独立模块。
- [Risk: 现有 `/app` UI 被研究语义压得过重] → Mitigation: 先保留现有 workbench 布局，只增加 asset library、publish review、preview 面板，不一次切换成复杂 canvas。
- [Risk: published asset 和 repo docs artifact 混淆] → Mitigation: 明确把用户资产数据落到 product dataDir；仓库里的 `docs/superpowers/*` 继续只作为工程文档。
- [Risk: governance 规则太多导致 V1 推进慢] → Mitigation: 只做最小 RBAC、最小 request types、最小 audit 字段，不做完整企业流程。

## Migration Plan

1. 增加 research asset store 和相关 schema helpers。
2. 在 `web-session-manager.cjs` 中接入 workspace/asset/review-request/audit lifecycle。
3. 在 `server.cjs` 中新增 asset 与 publish 相关 API。
4. 在 `web-app-shell.html` 中增加 asset library、asset preview、publish review surface。
5. 增加 targeted tests，证明 publish lifecycle、RBAC、audit、UI visibility 都可回归。

## Open Questions

- V1 是否要把 `.md/.txt` source upload` 一起纳入首轮，还是先只支持由 session / manual entry 生成 `Evidence`？建议首轮先不把广义文件上传做成 capability，只保留数据模型接口。
