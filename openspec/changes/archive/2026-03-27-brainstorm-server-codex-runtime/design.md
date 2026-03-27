## Context

当前仓库已经有三层基础设施：

1. `question` / `answer` / `summary` / `artifact_ready` 的结构化 transport contract
2. browser-first 的 `/app` Web 产品壳与会话持久化
3. 一个仅用于验证 contract 的本地 `structured-demo` runtime

这说明前端壳和消息协议已经足够支撑真实产品，但“真正做脑暴”的后端还不存在。当前 `web-session-manager.cjs` 仍然把每个会话绑定到固定的 demo flow，无法：

- 根据真实上下文连续追问
- 通过真实 Codex 会话恢复中断状态
- 将 brainstorming 结果自然衔接到后续 summary / artifact handoff
- 在 app-server 不可用时优雅退回 `codex exec`

这次变更是一次后端接线与运行时替换，不是 UI 重做，也不是一次把 deep research、最终报告生产、SaaS 化能力全部做完。

## Goals / Non-Goals

**Goals:**
- 让 `/app` 背后运行真实 Codex brainstorming 会话，而不是硬编码 demo 问题树。
- 引入独立的 Codex runtime adapter 层，优先使用 `codex app-server`，必要时回退到 `codex exec`。
- 保持浏览器仍然是 renderer-only host，只接收 `question` / `summary` / `artifact_ready` 并提交归一化 `answer`。
- 持久化会话的后端模式、后端会话标识、当前活跃消息和已确认答案，使页面刷新后可以继续而不是重开假流程。
- 保持 legacy watched-HTML companion 模式和本地 demo runtime 作为兼容/开发路径。

**Non-Goals:**
- 在这一变更里同时实现 deep research、联网检索、长文报告生成流水线。
- 在浏览器里暴露 CLI、日志流、MCP 细节或协议调试面板。
- 重新定义结构化消息协议或新增一套与现有 contract 平行的前端协议。
- 让 Node 测试直接依赖真实在线 Codex 服务；自动化验证仍应以 fake adapter 和 headless 流程为主。

## Decisions

### Decision: 用独立的 Codex adapter 层替换 demo runtime，而不是把 provider 逻辑塞进 `web-session-manager`

新增一个运行时边界，例如：

- `createCodexRuntimeSession(...)`
- `resumeCodexRuntimeSession(...)`
- `submitAnswer(...)`
- `getCurrentMessage(...)`

这个边界负责和真实 Codex 后端打交道，而 `web-session-manager` 只负责：

- 会话生命周期
- 会话持久化
- HTTP API 形状
- artifact 文件落盘

**Why this over直接在 `web-session-manager` 中 spawn Codex?**
- `web-session-manager` 已经同时承担 API 状态和持久化职责，再把 provider 协议、子进程、fallback 策略塞进去会迅速失控。
- provider 差异（app-server 与 exec）应被隔离在 adapter 内，否则所有调用点都会被迫理解后端差异。
- 这能让自动化测试通过 fake adapter 覆盖大部分行为，而不是依赖本机是否装好、配好 Codex。

### Decision: 后端选择策略固定为 app-server 优先，exec 回退；一旦建会话就固化 backend mode

会话创建时，运行时先探测 `codex app-server` 是否可用；可用则使用 app-server adapter。若不可用，则尝试 `codex exec` fallback。选定后把 `backendMode` 和必要的 provider session identity 持久化到本地 session 文件中。

后续这个会话始终沿用同一 backend mode，而不是每次提交答案重新探测。

**Why this over每一轮都重新挑选后端?**
- 真实脑暴会话必须保证连续性；中途切换 provider 模式会破坏上下文和 resume 语义。
- app-server 与 exec 的状态模型不同，混用会导致“当前问题是谁提的、下一轮该从哪继续”变得不可靠。
- 固化 backend mode 可以简化问题排查，也便于把 degraded mode 作为明确的产品状态，而不是隐式漂移。

### Decision: app-server adapter 负责“实时会话”，exec adapter 负责“历史重放式会话”

两种 adapter 的状态模型不同：

- `app-server` 模式：优先持久化 thread/session 标识与当前阻塞中的结构化问题，后续继续同一个远端会话。
- `exec` 模式：把确认过的用户输入、已发出的结构化问题和最近 summary/artifact 上下文持久化为 transcript，每次继续时重建 prompt，再请求 Codex 输出下一步。

**Why this over强行给两种后端做同一套底层状态机?**
- `app-server` 天生适合长会话，`exec` 更接近逐轮调用；假装两者完全等价只会把差异隐藏成 bug。
- 对用户而言，他们只需要一个连续会话；对实现而言，应明确两种 provider 的恢复策略不同。
- 这允许优先落地 app-server 正常路径，同时保留 exec 作为可工作的后备，而不是为了统一抽象牺牲两边可用性。

### Decision: 继续复用现有结构化 transport contract，把 Codex 输出规约成统一消息

真实 Codex 输出进入浏览器前必须被规约为现有 contract：

- `question`
- `summary`
- `artifact_ready`

如果 Codex 请求用户输入，adapter 必须将其转换为 `pick_one` / `pick_many` / `confirm` / `ask_text` 之一；如果 Codex 给出阶段性收敛结果，则转换为 `summary`；如果生成了实际 markdown 产物，则转换为 `artifact_ready`。

**Why this over让 `/app` 直接吃 Codex 原始事件?**
- 用户已经明确不希望看到 CLI/协议细节。
- 现有浏览器 host 已围绕统一 contract 写好渲染、输入归一化与完成态逻辑，直接暴露原始事件只会把 UI 再次退化成调试器。
- 统一 contract 还能保留和 legacy demo、未来 GUI host 的兼容性。

### Decision: 明确把“解析 Codex 结构化提问”做成可替换策略，而不是只赌一种输出形态

首版应支持两类来源：

- 首选：Codex 通过 app-server 提供的结构化用户输入请求
- 回退：Codex 输出 parser-friendly 的结构化文本块，再由本地解析器映射为 contract

这意味着 adapter 内部需要一个 parser/mapper 层，而不是把“问题抽取”散落在 session manager 和 UI 里。

**Why this over只支持 app-server 原生结构化事件?**
- 这会让 exec fallback 几乎不可实现。
- 历史经验里，parser-friendly 的 `pick_one / pick_many / confirm / ask_text` 文本块是稳定可用的保底路径。
- 双路径收敛到同一个 contract，有助于把后端差异限制在最小边界内。

### Decision: 自动化验证以 fake Codex adapter 为主，真实 Codex 只做补充验证

这次变更的测试重点应是：

- 会话创建是否选择了正确 backend mode
- 问题/答案/完成态是否通过统一 contract 流转
- 刷新或重启 manager 后是否还能恢复当前活跃问题
- fallback 路径是否不会 silently 回到 demo flow

因此测试主体应使用可编排的 fake adapter；真实 Codex 集成可以保留为手动 smoke test 或受环境变量控制的集成验证。

**Why this over在 CI 里直接依赖真实 Codex?**
- 当前仓库测试需要本地稳定、可重复，不能绑定外部服务可用性。
- 运行时契约的正确性比“这台机器此刻能不能连上 Codex”更值得被自动化锁定。

## Risks / Trade-offs

- **Risk: app-server 协议细节和当前预期不完全一致** -> Mitigation: 把 provider 交互收口在 adapter 内，先实现 fake adapter 和 fallback parser，再对真实 app-server 做最小侵入接线。
- **Risk: exec fallback 因为逐轮重放而丢失语义** -> Mitigation: 明确保留已确认问题、已确认答案和最近 summary，重建 prompt 时只带必要上下文，不假装是远端原生 session resume。
- **Risk: 后端失败时系统又悄悄退回 demo flow** -> Mitigation: 删除默认 `structured-demo` 作为 `/app` 正常路径；无可用后端时返回显式错误，而不是假装脑暴正常工作。
- **Risk: artifact 生成范围膨胀成完整报告流水线** -> Mitigation: 首版 artifact 只要求真实、可持久化、可打开，内容可以是 brainstorming markdown handoff，不强行扩到 deep research。
- **Risk: 浏览器刷新恢复不完整** -> Mitigation: session 文件中持久化 backend mode、provider identity、current message、normalized history 和 artifact metadata，并为重载场景写专门测试。

## Migration Plan

1. 提取新的 Codex runtime adapter 接口，并为测试实现 fake adapter。
2. 把 `/app` 的 session 创建与答复提交流程改为走新 runtime，而不是固定 `structured-demo` flow。
3. 落地 backend mode 选择与 session 持久化格式扩展。
4. 将 completion 路径接到真实 summary / artifact 产物落盘逻辑。
5. 保留 legacy watched-HTML 路径与 demo runtime，确保兼容性测试继续通过。

Rollback 策略保持简单：如果真实 runtime 路径不稳定，可以在路由层禁用 `/app` 的 Codex runtime，保留 legacy companion 和 demo contract 验证能力。

## Open Questions

- 当前环境中 `codex app-server` 可用的最稳定启动/连接方式具体是什么，是否需要单独的长驻进程管理脚本？
- `exec` fallback 的最小 prompt 模板应当放在 runtime 模块内，还是沉淀成一个明确的 brainstorming adapter prompt asset？
- 首版 `artifact_ready` 是否只输出 markdown handoff 文档，还是同时要区分 `summary` 与 `design-doc` 两类 artifact？
