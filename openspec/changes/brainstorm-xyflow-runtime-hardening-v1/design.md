## Context

用户这轮明确拒绝继续接受“语义对了但树效果没出来”的中间态。前一条 change 已经把前端状态模型推进到了 topic/path/active/convergence/artifact，但仍然没有交付出真正的树形画布视觉效果；这进一步证明继续手工维护原生 DOM 假树布局风险很高，且无法恢复用户信任。

另一方面，当前“第二题无法选择提交”的问题也不能再模糊处理。已有代码表明：

- `structured-host.cjs` 已经能够收集 `.option.selected` 并归一化 `selectedOptionIds`，前端选择本身并非完全没有实现；
- `web-session-manager.cjs` 对 `submitAnswer()` 有超时保护，但 `createSession()` 没有同等级的 bounded timeout/fallback；
- 真实 runtime 一旦慢或挂起，浏览器会表现成“点了没有反应”或“第二题走不下去”。

因此这条 change 必须同时解决两个层面：

1. 把主画布升级成真正的 node/edge graph，而不是继续手工拼接伪树；
2. 把 create/submit 的 runtime 生存性修好，让产品至少能稳定走完一轮。

## Goals / Non-Goals

**Goals:**

- 用 `@xyflow/react` 交付一个真正的树形决策画布，能直接看见节点、边、分叉和收敛。
- 继续保留“一个正式 active node 可回答，其余节点只 inspect”的产品规则。
- 把 active、convergence、artifact 都做成图中的真实节点，而不是脱离图的卡片或侧栏结果页。
- 给 createSession/submitAnswer 增加 bounded timeout、fallback 和 recoverable error，避免浏览器长时间无响应。
- 用测试锁住“第二题提交可继续推进”这一类基础可用性问题。

**Non-Goals:**

- 不做 Flowith 级别的自由白板、任意拖拽编辑、多人协作或无限布局编辑器。
- 不重写后端协议，不把 browser host 变成 workflow engine。
- 不在这条 change 里追求完整视觉 polish；第一目标是“树像树、流程能走、结果可见”。
- 不在这条 change 里替换现有 session/artifact API。

## Decisions

### Decision: 用 `@xyflow/react` 取代继续手写树布局

主画布改为 `@xyflow/react`，节点使用自定义 React node components，边由 xyflow 管理。这样可以直接获得：

- 节点和边的真实图形语义
- 平移/缩放/聚焦等图画布基础能力
- 对 custom nodes 的良好支持，适合把 active question 的真实交互嵌入节点内部

**Why this over 继续手写 HTML + SVG?**

- 当前仓库已经证明手写方案很容易交付出“语义树”而不是“可见树”。
- 用户现在需要的是可见效果和可信交互，不是继续赌自绘质量。

### Decision: 用“React island”方式接入，而不是全站改成 React SPA

保留现有 `server.cjs`、`web-session-manager.cjs`、`/api/sessions` 等后端与会话协议不变，只把主画布实现抽成一个小型前端 bundle：

- `web-app-shell.html` 保留顶层框架与挂载点
- 新增一个 graph client bundle 负责渲染 xyflow 画布
- `web-mainstage.cjs` 退化为“session -> graph nodes/edges state adapter”

**Why this over 全量前端重构?**

- 当前问题集中在主舞台，不需要把整个 repo 改成新的前端工程。
- 保持后端和 API 不变，能显著降低迁移风险。

### Decision: 先用 `dagre` 做确定性树布局，保留将来切换 `elkjs` 的接口

V1 用 `dagre` 做树布局：

- topic/path/active 沿主干排布
- branch 从 active 分叉
- convergence 在 branch 后收拢
- artifact 挂在 convergence 后方

同时把布局逻辑封装成 graph layout adapter，未来如果 `dagre` 对收敛场景不够好，再切 `elkjs`。

**Why this over 一开始上更复杂布局引擎?**

- 当前最重要的是快速交付清晰、稳定、可预测的树形结构。
- `dagre` 足够支撑 V1 的单主题、单 active、有限分支和完成 cluster。

### Decision: Active node 继续承载正式交互，其它节点只做 inspect/export/navigation

即使迁移到 xyflow，也不改变“只有一个正式 active node 可回答”的规则：

- `ActiveQuestionNode`：内嵌 structured host 交互
- `TopicNode`：显示主题和起点
- `PathStepNode`：显示已完成步骤
- `BranchNode`：显示候选方向
- `ConvergenceNode`：显示总结结果
- `ArtifactNode`：显示导出/预览入口

**Why this over 让每个节点都可继续发问?**

- 后端 runtime 仍然是单 active question 协议。
- 如果让每个节点都可回答，会再次引入 workflow authority 漂移。

### Decision: Runtime create/submit 都必须有 bounded timeout 和显式 fallback

`createSession()` 和 `submitAnswer()` 都必须满足同一条生存性规则：

- 在 bounded timeout 内返回成功
- 或进入明确 fallback
- 或返回可重试的错误状态

具体策略：

- 给 `createSession()` 增加与 `submitAnswer()` 同级的 timeout 包装
- 在 `workflowMode=full_skill` 下，create/submit 都允许 fallback 到 fake/local path，但必须记录 provenance 和 fallback reason
- UI 必须区分 `pending`、`fallback_recovered`、`failed_recoverably`

**Why this over 继续只对 submit 做 timeout?**

- 用户已经遇到 create 和第二题提交都“不知道是不是死了”的问题。
- 只修 submit 不修 create，仍然不具备基本可用性。

### Decision: 把“第二题提交”做成专门的回归场景，而不是只靠人工点

增加专门测试覆盖：

- seeded session 进入第二题
- 用户选择单选/多选
- submit 后必须在 bounded time 内进入 next question、summary、artifact_ready 或 recoverable error

**Why this over 继续手工 smoke?**

- 当前信任问题就出在“看起来做了，实际上下一题走不通”。
- 这个问题必须自动化回归。

## Risks / Trade-offs

- [Risk: 引入 React + xyflow 增加前端复杂度] → Mitigation: 只做 graph island，不碰后端和其他页面逻辑。
- [Risk: 现有测试夹具是静态 shell，接入 bundle 后测试不稳定] → Mitigation: 保留明确 DOM 标识和可预测渲染输出，测试以壳子结构和 API 行为为主。
- [Risk: `dagre` 布局在 convergence/artifact 场景下不够理想] → Mitigation: 预留 layout adapter，先保证可用树效果，再评估切换 `elkjs`。
- [Risk: fallback 虽然避免卡死，但结果和真实 runtime 有差异] → Mitigation: 把 fallback provenance 明确记录在 inspection/provenance API，中间态可见但默认 UI 不暴露协议细节。
- [Risk: 当前 dirty worktree 干扰新 change 实施] → Mitigation: 新 change 只承担规划；实现阶段严格按 tasks 分批推进并在必要时先整理前一条 change 的未归档状态。

## Migration Plan

1. 新增 graph client bundle 和依赖，先完成最小 xyflow 画布挂载与静态 node/edge 验证。
2. 把 `web-mainstage.cjs` 改成 graph adapter，输出 xyflow 所需的 nodes/edges/node data。
3. 实现 custom nodes，并把 structured host 嵌入 `ActiveQuestionNode`。
4. 把 convergence/artifact 完成态迁移到 graph 中，替代当前 inspector 主结果展示。
5. 给 `createSession()` 增加 timeout/fallback，与 `submitAnswer()` 行为对齐。
6. 补齐回归测试，重点锁住“第二题提交继续推进”和“runtime 不会无界挂死”。

## Open Questions

- graph bundle 是放在 `skills/brainstorming/scripts/` 下直接构建，还是单独放一个最小 `web-client/` 目录再产出静态 bundle；优先选对测试 harness 侵入最小的一种。
- `dagre` 是否足够满足 convergence -> artifact 的视觉要求；如果第一次原型效果仍弱，需要尽快切 `elkjs` 而不是继续调 CSS。
