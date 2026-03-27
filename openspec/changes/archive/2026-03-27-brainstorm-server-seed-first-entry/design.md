## Context

当前 `brainstorm-server` 的 runtime 已经能做 `scope -> reframe -> diverge -> converge -> handoff`，但浏览器产品的 session lifecycle 仍然停留在“点 New Session -> 立刻创建空 session -> 后端生成默认 Q1”。这导致：

1. 用户真正的脑暴议题没有在会话创建前被捕获。
2. 默认 intake 问题被误当成了正式脑暴第一问。
3. 页面首次加载时自动建 session，会在用户什么都没说之前就生成问题。

所以当前缺口不是 prompt 层，而是 session start protocol。要让产品真的像“用户抛出问题，然后被引导进入脑暴”，必须把 seed 放到 session create 之前。

## Goals / Non-Goals

**Goals:**
- 让用户在创建 session 前先输入脑暴议题、困境或问题陈述。
- 让 `/api/sessions` 接收 seed，并把它持久化到 session state。
- 让 seeded session 的第一个正式问题直接基于 seed 进入 `reframe` 或其他高信息增益动作，而不是再问一次“你想 brainstorm 什么”。
- 保持现有 `question` / `summary` / `artifact_ready` contract 不变。
- 保留无 seed 创建 session 的兼容回退，但不再作为主 UX。

**Non-Goals:**
- 不在这次变更里重做整个 `/app` 视觉风格。
- 不在这次变更里引入多议题并行、树形分支或多人协作。
- 不改变现有结构化 answer message 的 schema。

## Decisions

### Decision: 在 host 层增加“seed capture stage”，而不是在 runtime 内继续模拟 intake

浏览器产品在真正创建 session 前先展示一个 seed capture surface，例如一个大输入框和开始按钮。只有用户提交 seed 后，才调用 `POST /api/sessions`。

**Why this over继续让 runtime 先问第一个问题?**
- 如果 session 已经创建，runtime 天然会被迫产出一个第一问。
- 这会把“收集议题”与“围绕议题脑暴”混在一个问答流里。
- seed capture 属于产品入口，不属于正式 brainstorming turn。

### Decision: `/api/sessions` 接受 `initialPrompt`，并把它持久化为 session seed

Session manager 增加 `seedPrompt` 或等价字段，并把它存进 session JSON。runtime `createSession` 也接收这段 seed。

**Why this over只在前端临时保存?**
- seed 是 session 的根上下文，刷新和恢复时必须还在。
- exec fallback 和 app-server provider 都需要看到同一段 seed，不能只活在页面状态里。

### Decision: seeded session 直接初始化为带 `problemFrame` 的脑暴状态

如果 createSession 时存在 seed：
- 将 seed 写入 `problemFrame.summary`
- 在 `decisionTrail` 记录 `topic`
- 把 `nextLearningGoal` 设为 `select-the-best-problem-frame`
- 首个正式问题直接走 `reframe_problem`

如果没有 seed：
- 保留现有 fallback，允许 runtime 发出通用 scope intake 问题

**Why this over仍从 `scope` 开始但不显示?**
- 隐藏 scope 只是视觉修补，语义上仍然没有用户 seed。
- seeded session 已经知道“要 brainstorm 什么”，再问一次 scope 是重复动作。

### Decision: 页面首次加载不再自动创建空 session

当前页面没有 session 时会自动 `createSession('artifact')`。这必须改为显示 seed capture stage，等待用户主动输入议题。

**Why this over保留 auto-create but show placeholder?**
- auto-create 会在后台产生一个实际 session 和实际问题，仍然污染历史。
- 用户一打开页面就看到系统问话，本质上还是旧问题。

### Decision: 兼容模式下仍允许无 seed 创建 session，但测试和主流程都以 seeded path 为主

保留无 seed path 是为了不破坏已有程序化调用和旧测试，但产品侧默认行为切到 seed-first。

**Why this over完全删除无 seed path?**
- 完全删除会带来更大兼容风险。
- 当前真正需要的是把 primary UX 修正，而不是立即砍掉所有 fallback。

## Risks / Trade-offs

- [Risk: 前端新增入口状态使页面逻辑更复杂] -> Mitigation: 把 seed capture 保持为单一局部状态，只在 session 尚未创建时显示。
- [Risk: app-server 和 exec 对 seeded session 的首轮行为再次分叉] -> Mitigation: 两条路径共用同一套 strategy initialization helper。
- [Risk: 兼容无 seed path 导致后续回归又滑回旧行为] -> Mitigation: 增加明确测试，锁住 seeded path 为默认 UX，且页面禁止自动空建 session。
- [Risk: seed 直接变成 problemFrame 可能过早定框] -> Mitigation: 首轮正式问题改为 reframe，而不是把 seed 当最终结论。

## Migration Plan

1. 扩展 session create API 和 persisted session schema，增加 seed 字段。
2. 调整 web app shell，先采集 seed，再创建 session。
3. 在 runtime adapter 内增加 seeded initialization helper，并让 app-server/exec 共用。
4. 更新测试，覆盖无 seed fallback 和 seeded primary path。
5. 手工 smoke 验证：页面初始不出现默认问题；输入 seed 后第一问必须是正式脑暴问题。

## Open Questions

- Seed capture stage 是否需要区分 “我想解决的问题” 和 “我想产出的交付物”，还是先统一为一个输入框？
- 后续是否需要在 UI 上显式展示 seed card，固定提醒当前脑暴议题？
