## Context

`brainstorm-async-session-processing-v1` 已经把 create / submit 改成后台任务，并把 `processing` 写进 session JSON。但当前 `processing` 还是偏“单个作业正在跑”的轻量标记，不足以完整表达 session 生命周期：

- worker 丢失或服务重启后，session 可能长时间停留在 `running`，用户不知道它是还在算、已经卡住，还是应该重试；
- 删除、重试、重新打开 session 时，缺少明确的 job 世代边界，晚到的后台结果理论上仍可能覆盖较新的 session 状态；
- UI 能显示 running / failed，但还没有“这轮需要 attention、可以 retry、或者可以 cancel”的明确产品语义。

这次设计不再扩 branch 语义，也不提前引入“provider thread 深度 reattach 策略”；目标是先把 session 生命周期状态机钉牢，让 create / submit / reopen / retry / cancel / delete 这些基础动作都有可解释的行为。

## Goals / Non-Goals

**Goals:**
- 为 session processing 建立明确、持久化、可恢复的生命周期状态机。
- 检测 orphaned / stale 后台任务，避免 session 永远停留在 `running`。
- 允许用户对 stuck/failed 的 create 或 submit 做显式 `retry` 或 `cancel`，并保留最后一个稳定可见状态。
- 确保 retry/cancel/delete 之后，旧 worker 的晚到结果不会覆盖当前会话。
- 让浏览器在 reopened session 上给出明确的 lifecycle 状态和恢复动作，而不是只有笼统报错。

**Non-Goals:**
- 不在这次变更里重做 app-server thread 复用/重挂策略；更细的 provider recovery 另开 `Session Recovery Line`。
- 不扩展 branch compare、branch prune、branch merge 等分支产品能力。
- 不引入外部队列、数据库任务表或 websocket 推送协议。
- 不改变 structured question / summary / artifact_ready 的宿主消息合同。

## Decisions

### 1. 扩展 `processing` 为显式生命周期信封

`session.processing` 从轻量 `idle | running | failed` 扩展为更完整的生命周期记录，至少包括：

- `state`: `idle | running | retryable | cancelled`
- `action`: `create | submit`
- `jobId`
- `leaseOwnerId`
- `queuedAt / startedAt / heartbeatAt / updatedAt / finishedAt`
- `attemptCount`
- `pendingInput`
- `error`
- `supersededByJobId`

原因：
- `retryable` 和 `cancelled` 是用户可理解、可操作的稳定状态，比单纯 `failed` 更适合产品语义。
- `leaseOwnerId + heartbeatAt` 能把“还在跑”和“其实 runner 已经丢了”区分开。

备选方案：
- 继续沿用现有 `failed` 并靠错误文案区分。放弃，因为这会让 UI 和恢复逻辑都变成字符串判断。

### 2. 为后台 job 引入世代边界，拒绝 superseded late write

每次 `create / submit / retry` 都生成新的 `jobId`。后台 worker 在落盘前必须比对当前 session 的 `processing.jobId` 是否仍等于自己的 `jobId`：

- 若不相等，说明自己已被 retry/cancel/delete supersede，直接丢弃结果；
- 若相等，才允许写回新的 `currentMessage / history / providerSession / nodeLog`。

原因：
- 这是避免 session 被“过期结果”回写污染的核心护栏。
- 删除或 retry 之后，旧 worker 可能仍会自然结束；必须保证它的完成不会逆转用户新动作。

备选方案：
- 在 cancel/delete 时强杀所有底层 provider 调用。放弃，因为不同 backend 未必都支持可靠中止，而且不能替代持久化写保护。

### 3. 将 stale/orphaned runner 检测从“自动重放”改为“显式转为 retryable”

本线不做激进自动恢复。规则改为：

- 若 session `processing.state === running` 且 `heartbeatAt` 超过 lease TTL，则把它转成 `retryable`；
- 同时保留最后一个稳定的 `currentMessage` 和 `pendingInput`；
- 由用户显式点 `Retry` 或 `Cancel` 决定下一步。

原因：
- 这能先把“不知道现在发生了什么”的问题解决掉。
- 自动 reattach / replay 涉及 provider 线程语义，属于下一条 `Session Recovery Line`。

备选方案：
- 读接口命中 stale session 就自动重放。暂不选，因为这会把“检测 stale”和“怎么恢复”耦合在一起，回归面更大。

### 4. `retry` 以“最后稳定快照 + pendingInput”重启同一类动作

`retry` 行为：

- 对 `create`：从 seed prompt / completionMode / workflowMode 重新排队一次 create；
- 对 `submit`：从当前冻结 question、持久化 `providerSession / strategyState / history` 与 `pendingInput` 重新排队一次 submit；
- `attemptCount` 递增，旧 job 标记为 superseded。

原因：
- 用户关心的是“重新试一次当前这轮”，而不是重新手工提交同样的答案。
- 这也保留了 question 节点冻结不变的要求。

备选方案：
- 不提供 retry，只能重新提交。放弃，因为 stuck/failed create 根本没有可重提的 active question，submit 也会让用户怀疑是否重复提交。

### 5. `cancel` 是 session-level 产品动作，不是 provider-level kill 保证

`cancel` 语义：

- 将当前 `processing.state` 置为 `cancelled`；
- 清理 `pendingInput` 或标记其已取消；
- 保留最后一个稳定可见状态；
- 若旧 worker 稍后完成，因 jobId mismatch 被忽略。

原因：
- 这在产品层已经足够表达“我不想继续等这轮了”。
- 不依赖底层 provider 是否支持强中断。

备选方案：
- 不支持 cancel。放弃，因为用户离开太久后回来，至少应当有“放弃这轮后台任务”的明确出口。

### 6. 浏览器把 lifecycle 作为一等状态显示在 rail 和 request status 中

UI 规则：

- `running`: 显示“后台处理中，可离开页面稍后回来”
- `retryable`: 显示“本轮需要处理”，提供 `Retry` / `Cancel`
- `cancelled`: 显示“已取消本轮后台任务”，允许继续其他动作或删除 session
- `idle`: 按现有 question/summary/artifact 流程展示

同时：

- running/retrying 期间禁用重复 submit；
- deleting running session 时先将其标记为 cancelled/superseded，再执行删除；
- session rail 列表需能看出哪些 session 需要 attention。

原因：
- lifecycle 不只是内部状态；用户需要明确知道下一步能做什么。

## Risks / Trade-offs

- [Risk] `retryable` 与下一条 Recovery Line 的自动恢复边界可能混淆 -> Mitigation: 本线明确只做“检测 + 显式动作”，不做 provider 语义重挂。
- [Risk] heartbeat/lease TTL 过短会把慢任务误判为 stale -> Mitigation: 将 TTL 设计为配置项，并按 heartbeat 而非单次总耗时判断。
- [Risk] cancel 后底层 provider 仍继续执行，造成资源浪费 -> Mitigation: 接受这是一条产品层取消语义，并用 superseded late-write guard 保证状态安全。
- [Risk] lifecycle 状态增多会让 UI 文案和测试复杂化 -> Mitigation: 统一状态词表和 request-status/session-rail 映射，避免各处自由发挥。

## Migration Plan

1. 扩展 session `processing` 结构并为旧 session 读取时补默认值。
2. 在 session manager 中加入 heartbeat、lease TTL、retryable/cancelled 转换和 late-write guard。
3. 增加 lifecycle API 动作，例如 `/api/sessions/:id/lifecycle` 上的 `retry` / `cancel`。
4. 调整前端 request-status 和 session rail，显示 lifecycle 状态与恢复动作。
5. 补回归测试：stale running、retry、cancel、delete after cancel、ignored late result。

若上线后发现 lifecycle 动作语义仍需调整，可先保留持久化字段，关闭 UI 上的 retry/cancel 入口；向前兼容不会受影响。

## Open Questions

- `retryable` 是否需要进一步细分为 `stale` 与 `runtime-failed` 两种可见状态；本次先统一为一个产品态。
- delete running session 时，V1 是否要强制先 cancel 再 delete，还是在 delete 内部隐式执行 supersede + remove。
