## Context

当前 browser brainstorming 的核心状态都由 `web-session-manager.cjs` 负责持久化：session JSON、当前消息、history、providerSession、nodeLog、artifact/result 都已经落盘。问题不在“没有状态”，而在“create / submit 仍然把一次 runtime turn 绑在单个 HTTP 请求里等待完成”。这会直接带来三个产品问题：

- 长耗时脑暴 turn 会被浏览器同步等待和服务端超时机制放大成失败感知。
- 用户离开页面再回来时，无法仅靠已持久化状态判断“这轮是在处理中、已完成、还是失败了”。
- 服务端把 runtime timeout、thread 缺失等错误直接冒成同步接口失败，浏览器既分不清严重性，也无法自然恢复。

现有代码基础足够支撑一次增量式架构调整：

- session 已经按文件持久化，适合记录后台 job 元数据。
- runtime adapter 已经具备 stale thread fallback / rebuild prompt 的恢复能力。
- 浏览器已经有 recent sessions、request status、rail 切换、session reload 等基础界面，不需要重新发明另一套产品流。

因此这次设计目标不是引入重型任务系统，而是在现有 session manager 上补齐 durable async execution。

## Goals / Non-Goals

**Goals:**
- 让 `createSession` 和 `submitAnswer` 变成快速确认式接口，不再要求浏览器阻塞等待 runtime 完成。
- 为 session 增加持久化的 processing 状态和待执行 payload，使用户离开页面后回来仍能知道系统在做什么。
- 让服务端在重启后能够重新挂起并恢复仍处于 processing 的 session job，而不是把它们永久卡死。
- 保持 question node 在提交后冻结不变，直到后台任务产出下一条真实消息。
- 改善错误语义：未知 session 仍然是 `404`，runtime/timeout/processing 失败应作为服务端或运行时错误暴露。

**Non-Goals:**
- 不引入 Redis、数据库队列、消息总线或跨进程分布式调度。
- 不改写 Codex runtime 的 structured message 协议。
- 不在这次变更里重做整个 mainstage 视觉体系，只补足与 processing 直接相关的状态呈现。
- 不把 host 升级成 workflow owner；真实问题流、交付物类型、brainstorming skill 逻辑仍由 Codex + skills 决定。

## Decisions

### 1. 用 session 内的 `processing` 信封承载后台 job 状态

每个 session 增加持久化的 `processing` 对象，至少包含：

- `state`: `idle | running | failed`
- `action`: `create | submit`
- `jobId`
- `queuedAt / startedAt / updatedAt / finishedAt`
- `attemptCount`
- `pendingInput`: 本次后台执行所需的最小输入
- `error`: 最近一次失败摘要

对于 `submit`，`pendingInput` 保存标准化 answer payload；对于 `create`，保存创建所需的 prompt / completionMode / workflowMode / flowId。

原因：
- 这是最小侵入的 durable async 模型，直接复用现有 session JSON 持久化即可。
- 后台 job 与 session 绑定，浏览器刷新或重新打开 session 时不需要额外查另一份任务表。

备选方案：
- 单独建 jobs 目录或独立任务表。放弃，因为当前产品阶段没有必要拆出第二套持久化模型。
- 只在内存里记 processing。放弃，因为这无法覆盖用户离页和服务重启。

### 2. `POST /api/sessions` 与 `POST /api/sessions/:id/answers` 改为“快速确认 + 后台执行”

创建 session 时：

- 先生成 session id 和初始 session 文件。
- 将 `processing.state` 标记为 `running`，写入 `create` job。
- 立即返回这个 provisional session。
- 在后台执行 runtime `createSession`，成功后写入首条 `question / summary / artifact_ready`；失败则把 `processing` 改为 `failed`。

提交 answer 时：

- 保持当前 `currentMessage` 不变。
- 先把标准化 answer 写入 `processing.pendingInput` 并返回当前 session。
- 后台执行 runtime `submitAnswer`，完成后再原子更新 `history/currentMessage/providerSession/nodeLog`。

原因：
- 这直接满足“用户不能守着页面”的约束。
- question 节点在提交前后保持不变，分支语义不被 UI 处理过程污染。

备选方案：
- 继续同步等待，但单纯提高 timeout。放弃，因为这只是推迟失败，不解决离页和后台处理问题。
- 新增专门 `/enqueue` API。放弃，因为当前 create/submit 语义已经明确，不需要新命名空间。

### 3. 通过“持久化 job + 内存注册表”做去重和自动恢复

session manager 内保留一个轻量的 in-memory `runningJobs` 映射，避免同一 session 同时启动多个后台 runner。但真正的恢复依据来自 session 文件：

- 当 `getSession`、`listSessions` 或显式 load 命中 `processing.state === running` 且本进程没有该 job 时，manager 自动尝试 re-enqueue。
- 对 `create` job，使用持久化的 `pendingInput` 重新调用 runtime `createSession`。
- 对 `submit` job，使用 session 当前冻结问题、已保存 `providerSession/strategyState/history` 与 `pendingInput` 重新调用 runtime `submitAnswer`。

原因：
- 用户离页、服务重启、旧 thread 失效都不应该让 session 永久悬空。
- 现有 runtime adapter 已有 stale-thread recovery，这里只需要重新驱动它，而不是重写 provider 协议。

备选方案：
- 服务启动时扫描全量 sessions 并一次性全部重放。放弃，因为代价更大，且不如按需恢复稳妥。

### 4. 浏览器通过轮询已有 session API 感知后台进度，不新增强耦合传输协议

前端不需要新 websocket 协议。只要：

- 创建/提交后拿到立即返回的 session；
- 在 `processing.state === running` 时定期轮询 `GET /api/sessions/:id` 与 `GET /api/sessions`；
- 一旦状态从 `running` 变为 `idle` 或 `failed`，刷新当前会话与左侧 session rail。

UI 行为要求：

- processing 期间保留当前 question 节点并禁用再次提交。
- request status 明确显示“后台处理中，可离开页面稍后再回来看结果”。
- 重新打开一个 processing session 时自动恢复轮询，而不是提示用户重新提交。

原因：
- 当前产品已经有 session reload 能力和 request-status 面板，轮询是最小改动方案。
- 不新增推送协议，能降低这次变更的复杂度和回归面。

备选方案：
- 直接上 websocket 推送。放弃，因为当前收益不如先把 durable async 流程做对。

### 5. 保留 timeout，但把它从“用户等待上限”变成“后台 worker 保护上限”

timeout 仍然需要存在，避免 provider 或 app-server 永远挂死；但它不再等价于浏览器必须等待多久。具体做法：

- runtime create / submit timeout 改为后台 worker 的 deadline，并统一支持从 server/session manager 透传配置。
- app-server client request timeout 不再写死为与浏览器同步交互绑定的短值，应允许更长的 brainstorming turn。
- 超时后写入 `processing.error`，session 进入 `failed`，而不是让用户只看到同步请求超时。

原因：
- “为什么要设置 timeout”的答案是保护后台 worker，不是要求用户守着页面。
- timeout 依然是必要的守护栏，但它应该服务于恢复和观测，而不是直接伤害 UX。

## Risks / Trade-offs

- [Risk] 后台 job 在服务重启时可能被重复调度一次 -> Mitigation: 用 `runningJobs` 做进程内去重，并以 session 中的 `processing.jobId` 和状态作为唯一有效执行记录。
- [Risk] 保持 `currentMessage` 冻结直到后台完成，可能让用户误以为提交未生效 -> Mitigation: 明确显示 rail/request status 的 processing 状态，并禁用重复提交。
- [Risk] 延长后台 timeout 可能让失败显现得更晚 -> Mitigation: 保留明确 deadline、失败状态和 retry/recover 钩子，而不是无限等待。
- [Risk] `getSession` 触发按需恢复可能让读接口带有副作用 -> Mitigation: 副作用限定为“重新挂起已经持久化为 running 的 job”，不改变业务内容本身。

## Migration Plan

1. 为 session 数据结构补充 `processing`，并保证旧 session 读取时自动补默认值。
2. 重构 `createSession` 与 `submitAnswer`：
   - 写入 provisional session / pending job
   - 后台执行 runtime
   - 成功或失败后再持久化最终状态
3. 调整 server route：
   - create/submit 改为快速返回
   - 未知 session 仍返回 `404`
   - 运行时错误写入 session 状态，不再被统一伪装成 `404`
4. 前端增加 processing 轮询、禁用重复提交、离页后恢复展示。
5. 补测试覆盖 create、submit、recovery、timeout、错误码与 UI 轮询。

如果上线后发现后台 job 恢复逻辑有问题，可回滚到同步提交实现；由于 session 文件结构是向前兼容的，多出的 `processing` 字段可被旧代码忽略。

## Open Questions

- processing 失败后，V1 是否需要显式“重试这次后台任务”按钮，还是先依赖重新提交当前问题。
- listSessions 是否需要额外暴露更细的 processing 摘要文案，还是保留 `state/action` 交给前端生成。
