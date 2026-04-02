## Context

`web-session-manager` 现在已经会把每个 question 按 immutable `nodeLog` / `roundGraph` 持久化，但 `web-mainstage` 仍把历史 round 渲染成轻量摘要节点，只把当前 active round 当作完整 question host。结果就是同一个 question 节点在提交前后会从“完整 question 卡”变成“摘要 round 卡”，虽然底层历史没被改，用户视觉上却会判断它被改写了。

这次改动的约束很明确：
- 历史 question 节点必须继续显示首次生成时的 question snapshot。
- 只有一个 active node 可以提交答案。
- 不允许靠 `currentMessage.questionId` 之类的可变当前态去重新推导历史节点样子。

## Goals / Non-Goals

**Goals:**
- 让历史 mainline question 节点在提交前后保持相同的 question-card 结构。
- 让非 active 的 branch question 节点也以只读 snapshot 形式显示，而不是退化成摘要卡。
- 保持单一 active 输入目标，避免多个节点同时可提交。
- 优先使用 `roundGraph` / `messageSnapshot` 作为历史显示源，减少对 `currentMessage.questionId` 的 fallback 依赖。

**Non-Goals:**
- 这次不处理 “Start Another Topic” 的布局迁移。
- 这次不实现 session 删除能力。
- 这次不重做树布局算法或 node 尺寸体系，只修正历史 question 的显示与交互语义。

## Decisions

### Decision: historical round nodes render the stored question snapshot

`web-mainstage` 在构建 `treeCanvas` 时，不再把 path round / 非 active branch round 强制压缩成摘要文本节点，而是优先使用 `round.message` 中保存的 question snapshot。

Why:
- 这是后端已经持久化好的真实 question 事实。
- 只要历史节点还显示 question snapshot，用户就不会把它误解成“被下一题覆盖了”。

Alternative considered:
- 保持摘要卡，再在 inspector 展示原 question。
  这个方案不够，因为树上的节点本体仍然看起来被改写了。

### Decision: read-only snapshot mode lives in `structured-host`

`structured-host.mountMessageHost()` 增加只读渲染模式。只读模式继续输出原 question card 标记，但不绑定选项切换和提交行为。

Why:
- 可以复用现有 question-card 视觉结构，保证“样子一致”。
- 可以在 active / historical 节点之间共享同一套 question 渲染，而不是维护两套卡片 UI。

Alternative considered:
- 在 graph 节点层新写一套 “historical question card” 静态模板。
  这个方案会再次造成 active 与 historical 视觉漂移，并引入重复模板。

### Decision: graph nodes carry `readOnly` instead of dropping `message`

graph workspace 为所有有 question snapshot 的 round node 传递 `message`，并额外传递 `readOnly`。只有 active node 的 `readOnly` 为 `false`。

Why:
- 历史节点需要保留原 question 外观。
- 单一 active 输入目标可以通过 `readOnly` 控制，而不是通过删掉 `message` 来实现。

### Decision: current mainline selection fallback must not depend on mutable `questionId`

当 session 已带有 `roundGraph.currentMainlineRoundId` 时，UI 不再根据 `currentMessage.questionId` 反推 `round-<questionId>` 作为历史节点标识。缺少持久化 round 数据时才允许最弱 fallback。

Why:
- real runtime 可能重复使用同一个 `questionId`。
- 历史节点的身份必须由持久化 round / node id 决定，而不是由当前问题的可变 id 推测。

## Risks / Trade-offs

- [历史 question 节点全部显示完整卡片后，画布更高更密] → Mitigation: 先保持 focused mode 的 fit 策略，只让当前路径和邻近节点进入 fit 范围。
- [只读 question 卡仍然看起来“可点击”] → Mitigation: 在 host 层禁用实际交互，并通过 node badge / inspector 保持只有 active node 可提交这一规则。
- [旧 session 缺少 `round.message` 时仍然只能显示摘要] → Mitigation: 优先吃 persisted round data；只有真正缺失 snapshot 的旧数据才退回摘要。

## Migration Plan

1. 在 `structured-host` 增加 read-only question render path。
2. 在 `web-mainstage` 让 path round / 非 active branch round 保留 `round.message`。
3. 在 graph node data 中传递 `readOnly` 并停止用“无 message”表示“不可交互”。
4. 增加主舞台测试，锁定历史 question 节点的 snapshot 不会在提交后退化成摘要卡。
5. 跑 `web-mainstage-state`、`web-product` 以及相关 session 测试，确认单 active 输入目标不回归。

## Open Questions

- 只读历史 question 节点是否需要额外显示一个很轻的 “Snapshot” badge；本次先不强制，避免引入新的视觉变化。
