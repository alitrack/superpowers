## Context

当前系统已经完成 question-first mainstage：浏览器里可以完成 structured brainstorming、review checkpoint 和最终 `spec + plan` completion，但交互仍然偏线性。用户已经明确要的是更像 `flowith.io` 的工作空间感，不过前提不是做一个通用白板，而是让 brainstorming 本身拥有空间组织、空间记忆和可回看的结构。

现有约束同样明确：

- backend 仍然负责 question sequencing、review checkpoint 和 completion message
- host 仍然只渲染 `question / summary / artifact_ready`
- 当前产品已经有 mainstage view state、recent context、completion surface
- 本轮不能把系统重新拉回研究 workbench，也不能同时做自由拖拽白板、多分支图编辑或新的 transport contract

因此，这次设计的核心不是“发明新 runtime”，而是把现有 session/workflow 数据重新投影成一个真正的 brainstorming canvas workspace。

## Goals / Non-Goals

**Goals:**

- 让当前活动问题在画布里成为绝对锚点，而不是退回多个并列 panel。
- 让最近步骤、已选方向、review draft、finished bundle 以支持卡片的形式挂在画布中，形成空间化上下文。
- 让用户可以在 focused mode 和 overview mode 之间切换，既能集中回答当前问题，也能感受到这轮 brainstorm 的整体结构。
- 保留“开始新的 brainstorm”入口，但把它做成工作区中的稳定入口而不是重置当前 session。
- 尽量复用现有 `web-mainstage` 状态和 backend contract，不新增 transport message 类型。

**Non-Goals:**

- 不做通用自由白板，不支持任意节点创建、连线、拖拽持久化或开放式布局编辑。
- 不实现真正的多分支并行推演图谱；V1 只支持单主路径加支持卡片。
- 不改 `question / summary / artifact_ready` 合约，不把 branching policy 下放到前端。
- 不把旧的 research workbench、治理面板、资产工作台重新塞回 brainstorming 默认 UI。

## Decisions

### Decision: Canvas workspace 是现有 session 的派生视图，不是新的独立数据模型

画布节点和布局信息从当前 session snapshot 派生，而不是新增一套独立持久化 canvas schema。V1 只需要根据：

- `currentMessage`
- `history`
- `workflow.visibleStage`
- `workflow.specArtifact / planArtifact`
- `seedPrompt`

生成一组有语义的 canvas cards。

**Why this over 新建独立 canvas store?**

- 这次 change 的目标是产品空间感，不是新协议或新存储层。
- 独立 canvas store 会引入同步、迁移和一致性复杂度，明显超出 V1。
- 现有 session 数据已经足够表达“当前问题 + 最近轨迹 + completion”。

### Decision: 画布采用语义固定区，而不是自由拖拽白板

V1 画布由固定语义区组成：

- 中心 anchor：当前活动问题或审批决策
- 邻近 path cards：最近 `2-3` 步
- supporting draft/result cards：review draft 或 completion artifacts
- stable dock：开始新的 brainstorm、focus/overview toggle、full history entry

用户可以浏览和切换焦点，但不能自由摆放或创建任意节点。

**Why this over 自由拖拽画布?**

- 用户要的是“像 Flowith 一样有工作空间感”，不是优先要一套白板编辑器。
- 自由拖拽会迅速引入布局持久化、碰撞、缩放和交互一致性问题。
- 语义固定区更容易保证“当前正式问题始终是主角”。

### Decision: 保留 one-active-question contract，所有 supporting cards 默认只读

无论是 history card、direction card、review draft card 还是 completion card，默认都只是 supporting context。真正可回答的对象仍然只有当前 anchor card。

点击 supporting card 可以：

- 高亮
- 在 inspector/expanded panel 中阅读
- 切到 full history / completion detail

但不会在前端产生第二个同时待回答的问题。

**Why this over 让多个卡片都可直接编辑或并行回答?**

- 这会破坏当前已经明确的“一次一个正式问题”产品原则。
- backend 当前也没有为并发正式问题设计协议。
- 用户现在需要的是空间理解，不是并发 branching engine。

### Decision: Focused mode 与 overview mode 作为浏览层，不作为 workflow 状态

Focused mode 默认打开：

- anchor 最大、最突出
- supporting cards 数量有限
- 当前任务一眼可见

Overview mode 用于回看结构：

- supporting cards 更完整
- completion/review cards 更可见
- 可以更强地感受到这是一个 workspace

这个切换只影响呈现，不改变 workflow stage 或 backend state。

**Why this over 把 mode 绑进 workflow?**

- focus/overview 是纯前端浏览体验，不应污染 session 协议。
- 保持为本地 UI state 更容易实现和测试。

### Decision: Completion 在画布里表现为 result cluster，而不是回到右侧详情卡

当 session 到达 `artifact_ready`，画布不应退回单张结果卡，而应展示 dedicated result cluster：

- bundle card
- design spec card
- implementation plan card
- stable “start a new brainstorm” dock

这仍然保留“完成态已经形成产品交付”的仪式感，同时符合 workspace 心智。

**Why this over 沿用当前 completion surface?**

- 当前 completion surface 虽然解决了 panel 竞争问题，但仍然偏线性。
- 既然本轮目标是 canvas workspace，就需要让完成态也在同一空间语言中成立。

## Risks / Trade-offs

- [Risk: 画布看起来像装饰层，而不是真正改善理解成本] → Mitigation: 所有节点和区块都必须来自明确语义，不允许为了“像画布”而堆无意义卡片。
- [Risk: 过度追求 Flowith 感导致当前问题不够突出] → Mitigation: Focused mode 默认开启，anchor card 始终最大且唯一可操作。
- [Risk: 没有自由拖拽会让用户觉得这不是真画布] → Mitigation: V1 先交付空间化浏览和结果组织；拖拽与自定义布局若需要，单独起后续变更。
- [Risk: completion cluster 与 review draft 让布局逻辑变复杂] → Mitigation: 先统一为 derived canvas card model，由 view state 决定哪些 card 出现。
- [Risk: 前端实现中顺手重引 research workbench 面板] → Mitigation: 本 change 明确只服务 brainstorming canvas，不恢复无关工作台信息。

## Migration Plan

1. 在现有 `web-mainstage` 基础上增加 canvas workspace view state，派生 anchor/supporting/completion card model。
2. 重写 `web-app-shell.html`，把当前线性 mainstage 改成语义固定区的 spatial workspace。
3. 增加 focused/overview、本地 full-history entry 和 supporting card inspection。
4. 把 artifact-ready 完成态改成 result cluster。
5. 补 browser/product regression tests 和 smoke，验证 anchor dominance、workspace readability 和 completion cluster。

## Open Questions

- V1 overview mode 是否需要轻量缩放效果，还是只需要不同密度的布局切换？优先选实现复杂度更低且可测试的一种。
- supporting card inspection 是做右侧 inspector、浮层详情还是内联展开？优先选不会削弱 anchor 主视觉的一种。
