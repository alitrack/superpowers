## Context

当前 `/app` 已经完成两件重要的事：

1. 浏览器已经是 browser-first 产品壳，不再依赖终端作为主要交互面。
2. 后端已经可以优先通过 `codex app-server` 驱动真实会话，并在需要时回退到 `codex exec`。

但在真实后端接通后，现阶段的提问策略仍然更像 intake form，而不是 brainstorming。真实 session 的前几轮问题通常收敛为“主题 -> 目标 -> 用户”这一类通用字段采集，虽然是 live Codex 在生成内容，却没有稳定体现：

- 问题重构
- 多方向发散
- 对关键不确定性的主动追问
- 显式的收敛标准
- 面向下一步行动的 handoff

这说明当前问题不在 transport contract，也不在 UI，而在“brainstorming strategy layer”缺失。现在的 runtime 能发出结构化问题，但不会稳定地执行一套真正的 brainstorming facilitation 过程。

## Goals / Non-Goals

**Goals:**
- 让后端按明确的 brainstorming phase 推进会话，而不是沿用通用 intake-style Q&A。
- 让每一轮问题围绕“下一步最关键的学习目标”生成，而不是固定填字段。
- 让 session 能经历 `scope -> reframe -> diverge -> converge -> handoff` 这样的脑暴过程，并在浏览器刷新后保持同一阶段与上下文。
- 保持现有 browser contract：前端仍然只渲染 `question` / `summary` / `artifact_ready`，不暴露调试协议。
- 为“这像不像真的 brainstorming”建立可回归的评估样例和验收标准。

**Non-Goals:**
- 不在这次变更里重做 `/app` 视觉设计或信息架构。
- 不把系统扩展成 deep research、联网检索或完整 PRD/报告流水线。
- 不要求所有 turn 都使用原生 `requestUserInput`；parser-friendly JSON fallback 仍然可接受。
- 不在这次变更里引入多 agent 并行脑暴或复杂树形画布。

## Decisions

### Decision: 引入显式的 brainstorming phase state，而不是继续让 prompt 自由漂移

每个 session 持久化一个 strategy state，至少包括：

- `phase`: `scope | reframe | diverge | converge | handoff`
- `nextLearningGoal`: 当前最值得提问的未知项
- `problemFrame`: 当前被确认的问题定义
- `candidateDirections`: 已产生、待比较的方向列表
- `selectionCriteria`: 当前收敛标准
- `decisionTrail`: 已确认的重要判断

**Why this over只改 prompt 文案?**
- 仅靠改 prompt 很容易在几轮之后退化回通用问卷。
- phase state 让 resume 语义成立；刷新后系统知道自己是在发散还是在收敛。
- 这也让评估变得可观察：我们可以判断当前问题是否匹配当前 phase。

### Decision: 把“只问一个问题”保留为 host discipline，但把“问什么”升级为 high-information-gain planning

前端仍然只显示一个正式可回答问题，这符合当前 host 与 structured contract，也符合真实 facilitation 中“一次只推进一个关键判断”的原则。

但 runtime 不再按固定字段顺序出题，而是每轮先内部决定：

1. 当前 phase 是什么
2. 当前最大的认知缺口是什么
3. 用什么问题最能减少该缺口
4. 该问题最适合 `pick_one / pick_many / confirm / ask_text` 中哪一种承载形式

**Why this over多题并发展示?**
- 用户已经明确偏好“一次只问一个关键问题”。
- 多题并发会让前端重新退化成表单，冲掉 brainstorming 的引导感。
- 真正需要变化的是提问策略，不是屏幕上同时放多少题。

### Decision: 将 brainstorming 的核心动作拆成“认知意图”，而不是继续按“字段类型”提问

runtime 内部维护 question intent，例如：

- `clarify_problem`
- `surface_constraint`
- `challenge_assumption`
- `reframe_problem`
- `generate_directions`
- `compare_directions`
- `commit_path`

每个 intent 再映射到结构化题型。

**Why this over主题/目标/用户/场景这种固定槽位?**
- 固定槽位天然导向 intake form。
- 真正的 brainstorming 问题来自“下一步要学什么”，而不是“下一格该填什么”。
- intent 层使同一题型可以承载不同认知动作，例如 `pick_one` 既可以用来选择目标，也可以用来选择问题框架或收敛标准。

### Decision: phase prompt 采用“内部脑暴工作流 + 外部结构化输出”双层策略

对于 app-server 和 exec 两种 provider，runtime 均使用统一的 brainstorming policy：

- 内部要求模型先判断 phase 与 next learning goal
- 再生成一个最合适的正式问题或一个 completion message
- 对外只输出共享 contract

必要时可以把内部工作流拆成两步：

1. 先产出内部 planning JSON（phase, learning goal, candidate directions, recommended next move）
2. 再产出用户可见的结构化问题

首版实现可以先以内联单步 prompt 完成，但数据结构应预留两步式 planner 的演进空间。

**Why this over直接让模型自由输出问题?**
- 完全自由输出容易再次滑回“泛泛追问”。
- 双层策略能把“思考状态”与“显示状态”分离，既保留结构化 UI，又提升脑暴质量。

### Decision: 将“发散”定义为后端必须显式产生多个方向，而不是只在脑中思考

当 session 进入 `diverge` phase 时，后端必须显式地把 2-5 个 candidate directions 纳入状态，并在需要时向用户展示选择或比较题，而不是仅输出一个默认路径。

这些 directions 可以来自：

- 问题重构角度
- 方案方向
- 用户细分路径
- 交付物类型

**Why this over只问更多澄清题?**
- 没有显式多方向，就谈不上 brainstorming，只是澄清。
- 真正的脑暴价值在于把用户没说出的替代路径带出来。
- 这也是后续 convergence 的基础。

### Decision: 新增评估样例与质量门，验证“像不像真正的 brainstorming”

除现有 contract tests 外，新增 scenario fixtures，覆盖至少这些用户起点：

- 模糊产品想法
- 已有方向但缺差异化
- 多人对齐场景
- 已有目标但缺行动方案

每个 fixture 至少评估：

- 首 3 轮是否避免机械字段采集
- 是否出现问题重构或方向发散
- 是否只有一个活跃问题
- 是否能在合适时产生 summary/handoff

**Why this over只保留 transport-level tests?**
- transport-level tests 只能证明“能问”，不能证明“会脑暴”。
- 这类功能的核心风险是行为退化，不加样例就会不断回到模板化访谈。

## Risks / Trade-offs

- **Risk: phase state 过度设计，实际 prompt 不跟随** -> Mitigation: 先让 phase 与 learning goal 真正进入持久化状态和 prompt 输入，再加评估样例锁住行为。
- **Risk: 发散问题变多，用户感觉拖沓** -> Mitigation: 保持“一次只问一个正式问题”，并要求每题都服务于一个明确 learning goal。
- **Risk: exec fallback 因逐轮重放而丢失发散上下文** -> Mitigation: transcript 中显式保存 candidate directions、problem frame、selection criteria，而不只保存问答文本。
- **Risk: app-server 与 exec 生成风格再次分叉** -> Mitigation: 共用同一套 planner policy 和 contract normalization，差异只保留在 provider transport 层。
- **Risk: 质量评估过于主观** -> Mitigation: 将 fixture 结果分解为可判定维度，例如“是否出现多个方向”“是否重述问题”“是否继续问字段型问题”。

## Migration Plan

1. 扩展 session persistence，加入 strategy state 字段，保持向后兼容旧 session。
2. 在 runtime adapter 内引入 phase-aware prompt builder 与 direction state 更新逻辑。
3. 先让 app-server 路径跑通新的 strategy engine，再让 exec fallback 复用同一策略状态。
4. 增加针对真实 session 的行为评估测试和 smoke fixture。
5. 如果新策略不稳定，可通过 runtime flag 回退到当前“provider-backed structured Q&A”模式，但仍保留真实 backend 连通能力。

## Open Questions

- 首版是否需要把 `phase` / `intent` 透出到 message metadata，供 UI 后续做更丰富的展示，还是先保持纯内部状态？
- 发散阶段是否必须始终显式展示多个方向给用户，还是允许模型在内部生成多个方向后只展示最值得比较的 2-3 个？
- handoff 首版是否统一收敛为 `summary`，还是在满足条件时直接输出 markdown artifact？
