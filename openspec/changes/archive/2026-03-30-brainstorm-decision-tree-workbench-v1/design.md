## Context

当前 browser brainstorming 已经具备三块基础能力：

- structured brainstorming flow 已能在浏览器里完成一问一答、review checkpoint 和最终 completion
- finished deliverable/result surface 已能把成熟结论与 `spec + plan` 区分开
- real Codex runtime 已可通过 `exec` 路径驱动真实会话，不再只能靠 fake runtime 演示

但当前产品的核心心智仍然不对。`web-mainstage.cjs` 里的 `buildCanvasWorkspace()` 仍然只产出 `anchorCard + supportingCards + completionCluster + dock + inspector` 这一套线性卡片模型；`web-app-shell.html` 也仍然把页面组织成“中心主卡 + 右侧支持卡/Inspector”的 detail-page 变体。即使视觉再继续优化，它依然不像一个真正的 brainstorming workbench。

本次变更的目标不是再做一轮“页面更好看”，而是把当前 UI 的组织模型纠正为 branch-first workbench，同时尽量复用已有 session/workflow 数据与 runtime contract，避免再次把工作扩大成新协议、新存储层或自由白板系统。

## Goals / Non-Goals

**Goals:**

- 把当前 browser shell 从 supporting-card 页面改造成 branch-first decision-tree workbench。
- 在同一个工作台里同时呈现当前 active node、父路径、相邻方向/检查点以及完成结果，而不是让它们退化成一列支持卡片。
- 保持 one-active-question 原则不变：任何时刻只有一个正式可回答节点，其余节点和面板都只是可查看、可检查的上下文。
- 把“new brainstorm”入口降为次级动作，不再与当前 active session 竞争主视觉。
- 尽量从现有 `session.history`、`workflow.visibleStage`、`workflow.checkpoints`、`workflow.review`、`provenance.questions` 派生工作台数据，避免引入新的后端协议族。

**Non-Goals:**

- 不做 Flowith 式自由拖拽/自由连线/无限白板编辑器。
- 不实现真正的多分支并行求解引擎；V1 只做“一个 active branch + 周边可见上下文”的工作台骨架。
- 不新增 runtime transport message 类型，不改变 `question / summary / artifact_ready` 主协议。
- 不在这次变更里把 research workspace、governance、publish review 等独立工作台功能重新并入 brainstorming 主界面。

## Decisions

### Decision: Workbench tree 由现有 session 数据派生，而不是新增持久化树模型

前端主视图改为从现有 session snapshot 派生出显式的 `decisionTree` 视图模型，而不是新增一套独立持久化 schema。V1 的树节点来源优先级如下：

- 当前 active node：`session.currentMessage` + `workflow.visibleStage`
- 已提交路径：`session.history`
- review / completion checkpoints：`workflow.checkpoints`、`workflow.review`
- 相邻探索方向：`provenance.questions` 与 finished synthesis 中可见的 explored directions

这样可以在不改变 backend contract 的前提下，把当前“线性历史 + 若干结果块”重建为用户可理解的 branch path。

**Why this over 新建 tree store?**

- 当前最缺的是正确的产品组织，不是新的存储层。
- 新 tree store 会带来迁移、同步、一致性和回滚成本，明显超出 V1。
- 现有 session/workflow 数据已经足够支撑“当前节点 + 已走路径 + 周边上下文”的第一版工作台。

### Decision: 主界面改成稳定 workbench 分区，而不是继续堆 supporting cards

V1 workbench 使用固定语义分区，而不是自由布局：

- branch rail / tree panel：显示 root、当前路径、相邻方向和完成检查点
- active node stage：显示当前唯一可回答的问题或审批动作
- context panel：显示所选节点详情、review draft、supporting artifacts、finished result package

这样做的重点是让用户理解“现在在哪个节点、是从哪里来的、周边还有哪些方向”，而不是继续把所有信息折叠为一列支持卡片。

**Why this over 继续打磨 anchor/supporting card 模型?**

- 现有模型的根问题是信息架构，不是视觉密度。
- 只改卡片样式无法提供 branch path、stage context 和空间记忆。
- 稳定分区比自由白板更容易测试，也更符合当前协议只允许一个 active node 的约束。

### Decision: one-active-question 规则保持不变，树上的其余节点默认只读

decision tree 里除当前节点外，其余节点都只是：

- path markers
- completed checkpoints
- sibling directions
- result/package nodes

它们可以被选中查看详情，但不会变成第二个可提交的正式问题，也不会在前端本地生成新的 workflow 分支。

**Why this over 允许多个节点同时作答?**

- 用户已经明确要求“一次一个正式问题”。
- 当前 backend sequencing 也没有为并发正式问题建立协议。
- 本次 change 要解决的是“看起来像产品、看得懂路径”，不是“先实现并发 branching engine”。

### Decision: Focused / Overview 仍然保留，但含义改成“树密度和上下文密度切换”

Focused mode 下：

- active node 最大且唯一主操作区
- tree panel 只展开当前路径与最近邻节点
- context panel 只显示当前最相关的 supporting context

Overview mode 下：

- tree panel 显示更完整的 branch path、checkpoints 和 completion nodes
- context panel 更容易浏览 artifacts / review draft / result package

模式切换仍然是前端局部状态，而不是 workflow 状态。

**Why this over 把 mode 绑定到 backend stage?**

- mode 反映的是浏览密度，不是流程语义。
- 保持为纯前端状态可以避免污染 runtime 或 session 持久化格式。

### Decision: 完成态仍留在同一工作台里，而不是跳回单独结果页

当 session 到达 `summary` 或 `artifact_ready`：

- tree panel 继续显示这轮脑暴的路径与完成节点
- active node stage 切换为 finished-result summary / recommendation
- context panel 展示 supporting package、可导出 artifacts 和补充细节

这样完成态不会像“跳出流程后打开另一个页面”，而是自然成为同一工作台里的终局节点。

**Why this over 单独结果页?**

- 用户需要理解结果与前面路径的关系，而不是只看到最终结论。
- 当前产品最缺的是“从问题到结论的空间连续性”。

### Decision: 本次变更不接入 research workspaces API，把范围收在 brainstorming 自身

虽然仓库里已有 `/api/workspaces` 和 review request 相关能力，但这一版不把它们作为主设计的一部分。decision-tree workbench 先围绕 brainstorming session 本身闭环，后续若需要与更广义的 research workbench 融合，再单独起 change。

**Why this over 现在就把 workspaces/review requests 一起做进来?**

- 这会把问题重新扩大成多工作台整合。
- 当前用户最不满意的是 brainstorming 自身不像产品，这个根问题应先被独立解决。

## Risks / Trade-offs

- [Risk: 派生树模型不够真实，只是把线性 history 包装成树] → Mitigation: 明确把节点类型区分为 active path、sibling direction、checkpoint、result node，不伪装成不存在的并行分支。
- [Risk: workbench 分区变多后，当前问题不再足够突出] → Mitigation: Focused mode 默认开启，active node stage 保持最大视觉权重，树和上下文面板都不得抢占主操作区。
- [Risk: 当前 session 字段不足以支撑完整树视图] → Mitigation: 对缺失字段采用稳态回退，只保证 root/current/path/checkpoint 的最小树；不要为了补齐视图而发明后端状态。
- [Risk: 开发时又滑回“把内容塞进 supporting cards”] → Mitigation: 新视图模型中把 `decisionTree`、`stagePanel`、`contextPanel` 作为一级结构，逐步淘汰 `supportingCards` 作为主组织模型。
- [Risk: 完成态与进行态共享同一工作台后，布局逻辑复杂化] → Mitigation: 统一通过 `deriveMainstageView()` 派生 question/review/completion 三态共用的 workbench skeleton，只替换每个分区的数据。

## Migration Plan

1. 在 `web-mainstage.cjs` 中把当前 `buildCanvasWorkspace()` 升级为 workbench 视图构造器，新增显式 tree/stage/context 分区数据。
2. 在 `web-app-shell.html` 中替换当前 anchor-card + supporting-card 布局，改为 branch-first workbench 骨架。
3. 调整前端事件与本地 UI state，让 Focused / Overview、节点选中、stage copy、completion surfaces 都基于新 workbench 模型工作。
4. 为缺失树字段的旧 session 提供稳态回退，确保现有 session 打开时不会崩溃。
5. 更新 `tests/brainstorm-server/`，覆盖 decision-tree 可见性、active-node 唯一可答、completion-in-workbench 等关键回归点。

## Open Questions

- V1 的 sibling directions 应只来自 `deliverable.synthesis.exploredDirections`，还是也允许从 `provenance.questions` 推出轻量邻接节点？实现时优先选择更稳定、可测试的一条。
- 当前完成态的 context panel 是否先保留现有 supporting package 卡片形式，还是同步做成树上的 result child nodes？建议优先保留现有 package 数据形状，只调整位置与层级。
