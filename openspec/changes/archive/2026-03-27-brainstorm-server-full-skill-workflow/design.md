## Context

之前几轮 change 已经把 `brainstorm-server` 从 demo 壳推进到了更真实的 Codex-backed brainstorming 产品：

- `/app` 有了 browser-first 入口
- session 可以从 seed 开始
- runtime 会读当前 `skills/brainstorming/SKILL.md`
- finished deliverable、provenance、artifact preview 已经收口

但当前产品仍然只覆盖了 SKILL 的“对话阶段”。这其实是一个明确的历史决策：为了先把 web 对话产品做出来，runtime 只抽取了 `Explore / Ask / Propose / Present`，刻意不把 `write design doc / spec review / writing-plans` 搬进 UI。

现在这个边界已经不够了。用户要的不是“更像 brainstorming 的网页问答”，而是“任何人都可以使用的头脑风暴产品”：

- 默认不要求理解 CLI、skills、subagents、git
- 系统在后台自动把完整 workflow 跑完
- 用户只在真正重要的节点做决定
- V1 能稳定交付 reviewable `spec + plan`

这意味着产品要从 “skill-grounded conversation UI” 升级成 “full skill workflow runner with non-technical UX”。

## Goals / Non-Goals

**Goals:**

- 在 UI 中完整承载 `brainstorming` SKILL 的 9 步 workflow，而不是只覆盖前半段对话步骤。
- 让默认用户视角始终是 outcome-first：只看当前阶段、待决策点、草案内容和最终 `spec + plan`。
- 自动处理内部工程动作，包括上下文探索、skill 读取、spec draft、spec review loop、plan 生成、以及本地 checkpoint。
- 只在真正影响用户结果或外部世界的动作上请求确认。
- 让 session 可以恢复、审计和调试，同时不把工程细节暴露给默认 UI。

**Non-Goals:**

- 不在这次 change 里自动进入实现阶段或生成最终代码/应用。
- 不在默认用户路径中暴露 `git`、`subagent`、`review loop`、`writing-plans` 这些工程术语。
- 不在这次 change 里引入多人协作、并行分支树或 deep research。
- 不要求普通用户理解仓库结构或 OpenSpec 工件组织。

## Decisions

### Decision: 产品默认采用 outcome-first 用户模型，而不是 raw skill checklist UI

用户界面不直接展示 9 条工程 checklist，而是展示对普通用户有意义的阶段，例如：

- 理解问题
- 比较方向
- 确认设计
- 审阅草案
- 审阅计划

内部 workflow 仍然完整执行：

1. explore context
2. optional visual companion consent
3. clarifying questions
4. approaches + recommendation
5. design approval
6. write design doc
7. spec review loop
8. user reviews spec
9. writing-plans completion

**Why this over直接把 9 步原样露给用户?**

- 非程序员不关心这些工程术语。
- 产品价值在于“拿到想要的结果”，不是“看系统如何调用内部机制”。

### Decision: workflow state 拆成 “用户可见阶段” 和 “内部执行阶段”

session state 需要同时保存两套状态：

- `visibleStage`: 用户当前看到的阶段、标题、待处理动作
- `internalStage`: 系统当前真正执行到哪一步，例如 `explore-context`、`write-spec`、`spec-review-loop`、`write-plan`

这样 host 才能做到：

- 默认 UI 简洁
- 开发态可审计
- 阻塞恢复时能准确续跑

**Why this over只保留一个 phase 字段?**

- 一个字段无法同时兼顾产品体验和工程恢复。
- 当前 `phase/handoff` 模型已经证明：内部状态不等于用户体验状态。

### Decision: 自动化边界默认偏向“后台全自动”，只在真正重要的节点请求用户确认

默认自动处理：

- 项目上下文探索
- skill 读取
- design/spec 草稿生成
- spec review loop
- writing-plans 执行
- 本地 checkpoint / snapshot

默认需要用户确认：

- 设计方向是否批准
- reviewable spec 是否接受
- 输出物类型是否改变
- 任何外部副作用，例如 push、publish、remote write

**Why this over凡事都问用户?**

- 普通用户不会也不应该替系统做流程编排。
- 如果每一步都问，UI 只是把 CLI 细节重新包装一遍。

**Why this over完全静默自动到底?**

- 一些动作确实改变最终交付物边界或影响外部世界，必须保留人类确认。

### Decision: checkpoint 是内部抽象，不让用户理解 git

系统内部引入 “workspace checkpoint” 抽象：

- repo 可用且安全时，可以 git-backed
- 非 git 环境时，可以 file-backed

默认 UI 只知道“已保存当前版本”或“可恢复到上一步”，不会出现 `commit`、`branch` 这类术语。

**Why this over始终依赖 git?**

- “任何人都可以使用”的产品不能要求工作目录一定是 git repo。
- 即使在 git repo 中，非程序员也不应被迫理解这些概念。

### Decision: spec review / reviewer / subagent 是内部质量机制，不是用户心智模型的一部分

系统可以在内部派发 reviewer、重试 review loop、比较草稿修订，但默认用户只看到：

- “系统正在完善草案”
- “质量检查通过，等待你确认”
- “需要你决定下一步”

如果 review loop 超过预算或无法自动收敛，再用非技术语言向用户解释阻塞。

**Why this over把 reviewer/subagent 暴露出来?**

- 这对默认用户没有价值，反而会损害信任和可理解性。

### Decision: V1 的完成态是 reviewable spec + plan bundle，而不是 implementation handoff 之后的真实实现

首版不直接串到代码生成或应用实现。完成态是一个可审阅的 bundle，至少包括：

- design spec artifact
- spec review result / review status
- implementation plan artifact

这样既兑现了完整 workflow 的主要价值，又把风险控制在可管理范围。

**Why this over直接自动实现?**

- 从 brainstorm 到 implementation 是另一个更高风险的系统边界。
- 先把 “完整 workflow 到计划产出” 做稳，才是合理的 V1。

### Decision: 尽量复用现有 transport contract，但扩展 session/bundle metadata，而不是发明一整套全新消息协议

当前 `question / answer / summary / artifact_ready` 仍然可复用：

- `question`: 正式问题、审批问题、可视化同意问题
- `summary`: 某些中间 reviewable draft
- `artifact_ready`: `spec + plan` bundle 完成态

新增重点放在：

- session-level workflow metadata
- stage label / pending action
- artifact bundle references

**Why this over新增大量 message types?**

- 新协议会同时增加 host、runtime、tests 的迁移成本。
- 现有 contract 已经足够表达大多数用户交互，缺的是 workflow metadata 和 artifact bundle。

## Risks / Trade-offs

- [Risk: 后台自动化太多，用户会感觉系统在“黑箱操作”] -> Mitigation: 默认 UI 显示明确阶段、当前动作和可审阅结果，同时保留开发态 inspection。
- [Risk: full workflow 比现在的对话闭环慢很多] -> Mitigation: 增加 stage progress、自动保存、恢复能力和长步骤状态反馈。
- [Risk: review loop 可能卡住] -> Mitigation: 设定重试预算；超过预算后转为用户可理解的阻塞提示，而不是技术报错。
- [Risk: git-backed checkpoint 在脏工作区行为复杂] -> Mitigation: 用 checkpoint abstraction 屏蔽实现差异，并提供非 git fallback。
- [Risk: V1 仍然把 spec/plan 叫法做得太工程化] -> Mitigation: 默认 UI 使用更通俗文案，工程术语只在开发检查面板出现。

## Migration Plan

1. 定义 full workflow state model、automation boundary policy、artifact bundle model。
2. 扩展 runtime/session persistence，使其能跑到 spec review 和 writing-plans 完成。
3. 引入 checkpoint abstraction 和 internal review orchestration。
4. 更新 host/UI，展示用户可见阶段、审批动作和 `spec + plan` bundle。
5. 增加验证，证明普通用户可以在不理解 CLI/gig/subagent/skill 的情况下完成到 `spec + plan`。

## Open Questions

- V1 默认用户文案里，是继续使用 `spec / plan`，还是统一改成更通俗的“方案文档 / 实施计划”？
