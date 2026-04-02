## Context

上一条 UI 变更已经把浏览器产品从“纯卡片列表”推进到了“树画布外观”，但核心交互仍然偏向中心问答面板：

- 新会话虽然支持 `seedPrompt`，但主界面仍然容易退化成“输入框 + 当前问题”；
- `web-mainstage.cjs` 已能派生 `topicNode / parentPath / activeNode / siblingBranches / resultNodes`，但这些节点仍然主要服务于一个外置主表单；
- `web-session-manager.cjs` 已持久化 `seedPrompt`、`summary`、`artifact_ready` 和导出产物，说明 V1 已有构建“主题根节点 + 收敛节点 + 产物节点”的数据基础；
- 当前 API 仍然清晰分为两类：创建会话时提交 `initialPrompt`，进行中会话通过 `/answers` 继续推进，这意味着浏览器必须继续把 backend 作为正式流程 authority，而不是本地自编问题顺序。

这次变更的目标不是再做一次“样式升级”，而是重新约束产品模型：浏览器产品必须从“中心问答页”转向“主题驱动的节点画布”。同时，这次设计必须保持实现可落地，不能假设 V1 立即具备自由拖拽画布、任意节点再执行或全新协议族。

## Goals / Non-Goals

**Goals:**

- 把“你想头脑风暴什么问题”固定为新会话的唯一正式入口，并在画布中持久化为根主题节点。
- 把浏览器主工作台定义为节点画布，而不是中心问答面板外加辅助侧栏。
- 让当前唯一可回答的步骤显示为画布中的 active node，并让父路径、相邻方向、收敛总结和完成产物都作为节点关系呈现。
- 让完成态不再脱离画布，而是在同一工作台中生成 convergence node 和 artifact node。
- 为每类节点定义有限、产品化、可实现的动作边界，避免再次滑向假画布或假交互。

**Non-Goals:**

- 不实现 Flowith 式自由拖拽、自由连线、缩放持久化或任意白板编辑。
- 不引入新的公开协议家族，也不把浏览器变成独立 workflow engine。
- 不要求 V1 支持从任意历史节点无约束地重新执行整段后台流程。
- 不暴露 `skills`、`subagent`、`git`、`review loop` 等工程术语给最终用户。

## Decisions

### Decision: 用“主题根节点 + 派生节点图”替代“中心问答页”

浏览器主状态继续从现有 session 数据派生，但派生目标从“当前问题视图模型”升级为“节点图视图模型”。V1 节点至少包含：

- `topic`：来自持久化 `seedPrompt` 的根主题节点
- `path-step`：从历史回答派生的已完成路径节点
- `active`：当前唯一可回答的正式节点
- `branch`：从 synthesis / shortlisted directions / adjacent context 派生的方向节点
- `convergence`：从 `summary` 派生的收敛节点
- `artifact`：从 `artifact_ready` 与 persisted artifact metadata 派生的产物节点

**Why this over 引入新的持久化树 schema?**

- 现有 `seedPrompt`、history、summary、artifact 已能支撑 V1 的正确产品骨架。
- 先把主产品模型纠正，比先造一套复杂树存储更重要。
- 新持久化 schema 会扩大范围，推迟产品纠偏。

### Decision: 维持“唯一 active node 可回答”，其它节点按类型提供受限动作

V1 保留 backend 对正式问题顺序的控制。浏览器只允许一个 active node 接受正式答案，其它节点根据类型提供受限动作：

- `topic`：查看主题、开始新主题
- `active`：回答、补充文本、提交当前正式输入
- `branch` / `path-step`：查看、比较、定位上下文
- `convergence`：查看收敛结果、打开相关产物、作为后续整理入口
- `artifact`：查看、导出、回到其来源收敛节点

**Why this over 允许所有节点都变成可回答节点?**

- 当前 runtime 与 API 明确围绕一个正式 active question 运作。
- 多个并发 answerable 节点会立刻把浏览器变成 workflow engine，范围失控。
- 先把“节点化思考工作台”做对，再考虑更强的任意节点再执行。

### Decision: 主舞台不再存在脱离画布的中心问答面板

active question 的表单、选项和状态都必须内嵌在 active node 中。Inspector 只负责解释当前选中节点、显示支持材料和产物细节，不能替代画布主舞台。完成态也不切换到独立结果页，而是在画布中让 convergence/artifact cluster 成为主视觉重心。

**Why this over 保留“树 + 中间表单 + 右栏详情”?**

- 那种结构本质还是 dashboard，不是节点化工作台。
- 只要答题表单脱离树，用户就会把树当成附属导航，而不是实际思考面。

### Decision: 完成结果通过“收敛节点 -> 产物节点”在画布中长出来

当会话进入 `summary`，前端生成 convergence node；当会话进入 `artifact_ready`，前端在 convergence node 旁或其下方生成 artifact node，并把导出、预览、文件元数据挂到 artifact node/inspector 上。这样用户能看见：

- 结果来自哪段探索路径
- 收敛结果和最终交付物的关系
- 重开完成会话时，首先看到的是完成节点而不是孤立摘要框

**Why this over 单独结果面板?**

- 单独结果面板会切断“过程 -> 收敛 -> 产物”的关系。
- 用户真正需要的是可回溯的结果，而不是脱离上下文的终点页。

### Decision: 会话恢复优先回到“上次未完成节点”或“最后完成节点”

恢复旧 session 时，浏览器优先定位到：

- 仍在等待回答时的 active node；
- 已完成会话中的 convergence/artifact cluster；
- 同时把 root topic node 始终保留在视野中。

**Why this over 每次都从顶部或 session 列表重新进入?**

- 头脑风暴的关键是延续当前思考位置，而不是重复确认已经存在的主题。
- 这也符合用户明确要求的“重开并继续上次脑暴会话”。

## Risks / Trade-offs

- [Risk: 仅靠派生节点图会让某些 branch 关系显得近似而非严格] → Mitigation: V1 明确把 branch/convergence 定位为“产品工作台语义”，优先保证用户可理解路径，再逐步加强 provenance。
- [Risk: 节点动作过少会被误解为假画布] → Mitigation: 明确每类节点至少有一种用户可见意义，并优先把 active/convergence/artifact 三类动作做扎实。
- [Risk: 节点动作过多会超出当前 backend 能力] → Mitigation: 用“按节点类型受限动作”替代“任意节点任意继续”，并在 spec 中锁死只允许一个正式可回答节点。
- [Risk: 完成态仍然像结果页而不是画布结果] → Mitigation: 验收时要求 convergence/artifact 必须与 topic/path 同时可见，禁止孤立结果页取代画布。

## Migration Plan

1. 扩展 `web-mainstage.cjs` 的派生状态模型，使其显式输出 `topic / path / active / convergence / artifact` 节点语义和主舞台聚焦信息。
2. 重写 `web-app-shell.html` 主画布结构，删除脱离画布的中心问答布局，把 active node、convergence node、artifact node 变成真实主舞台节点。
3. 调整浏览器节点交互和 inspector，让节点选择、完成态预览、产物导出都通过节点和次级抽屉完成。
4. 补充/更新浏览器产品测试，锁住单一主题入口、单一 active node、完成态节点化呈现、恢复定位等行为。

## Open Questions

- V1 的 convergence node 是否需要独立视觉层级，还是允许与 artifact node 组成完成 cluster；实现时优先选更稳、更不易退化成结果页的方案。
- 对非 active 节点的后续“继续”是否只做 inspect/export/restart topic，还是允许某些节点触发受控 continuation；如果实现风险过高，V1 先保证 active/convergence/artifact 三类节点成立。
