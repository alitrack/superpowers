## Context

目前 `/app` 已经朝“每轮 question 是一个 round node”收敛了一步，但仍有两个根问题没有彻底解决：

1. 正式产品路径仍然可能通过 fallback 生成 fake question，这会让用户以为自己在和 Codex 头脑风暴，实际却落在本地预设问题流上。
2. 现有 `roundGraph` 更像“当前 session 状态的可视化投影”，而不是“生成过的 question 节点日志”。这意味着树虽然看起来像历史，但本质上仍可能被后续状态重建、覆盖或漂移。

这两个问题不解决，分支语义仍然不稳：要做真正的 fork，父 question 节点必须是不可变快照；否则以后从 `node1` 分支时，无法保证它还是当时那个 `node1`。

## Goals / Non-Goals

**Goals:**
- 产品模式下，question 只能来自 real Codex backend，不能无声退回 fake question。
- 每个 question 在首次生成时就持久化为 immutable node snapshot。
- 每次回答只追加新 node / edge，绝不回写旧 question node 内容。
- 显式 fork 也只追加 child nodes，不把 source question 或 source option 改写成别的结构。
- reload、branch switch、mainstage focus 全部从 immutable node log 恢复。

**Non-Goals:**
- 这次不重做 prompt 设计或 brainstorming 策略本身。
- 这次不处理 legacy socket demo 路径；demo/fake 仍可保留在测试或兼容入口，但不能是正式 `/app` 产品路径 fallback。
- 这次不引入 CRDT、多人协作或自由编辑画布。

## Decisions

### Decision: `/app` product mode 禁止 fake runtime fallback

正式 browser product path 只允许两种后端：

- `app-server`
- `exec`

如果两者都失败，则 `createSession` 或 `submitAnswer` 直接返回显式错误，不再降级为 fake question。

**Why this over 保留 fake 兜底?**

- fake question 会直接破坏“question 来自 Codex 实时生成”的产品承诺。
- 用户无法判断眼前 question 是真实推理结果还是本地预设。
- 与其假装能继续，不如明确失败并暴露真实状态。

### Decision: 引入 append-only immutable node log

session 内新增一个真正的 node log，例如：

- `nodeLog.version`
- `nodeLog.nodes[]`
- `nodeLog.edges[]`
- `nodeLog.activeNodeId`
- `nodeLog.rootNodeId`

其中每个 question node 至少持久化：

- `id`
- `kind`
- `questionId`
- `title`
- `description`
- `optionsSnapshot`
- `metadataSnapshot`
- `parentNodeId`
- `createdAt`
- `backendMode`
- `sourceAnswer`

一旦写入，不允许修改这些字段；后续只能新增 node 或 edge。

**Why this over 继续维护 `roundGraph` 视图模型?**

- `roundGraph` 是“现态重建”，不是“历史事实”。
- 分支依赖稳定祖先节点，没有 immutable snapshot 就没有可信的 fork source。
- UI 可以从 node log 派生 `roundGraph`，但不能反过来把派生视图当作历史真相。

### Decision: answer 提交只追加 node，不改旧 node

无论线性前进还是 explicit fork：

- 父 question node 保持不变
- answer 记录附着在 edge 或 child node metadata 上
- backend 返回下一题时创建新的 child question node

线性推进：
- `node1 --(answer A)--> node2`

显式 fork：
- `node1 --(fork A)--> node2A`
- `node1 --(fork C)--> node2C`

**Why this over 更新 source node 的内容?**

- 更新旧 node 会让历史分支不可追溯。
- fork 的意义就是“从当时那个 node 出发派生多个后续”，不是重写祖先。

### Decision: 浏览器主画布只渲染 node log 派生结果

浏览器层不再从 `currentMessage + history + branchRuns` 直接拼树，而是：

1. 后端持久化 immutable node log
2. 加载 session 时返回 node log
3. `web-mainstage` 从 node log 派生 trunk / branch tree / active focus

这样 UI 只做渲染，不再承担“猜历史”的职责。

**Why this over 继续后端/前端各推一份树?**

- 两边同时猜树会漂移。
- node log 是唯一真相，派生结果可以任意换视觉，但历史不丢。

## Risks / Trade-offs

- [Risk: 禁掉 fake fallback 后，真实 backend 故障会更直接暴露给用户] → Mitigation: 明确报错文案和 retry path，让失败可见但可恢复。
- [Risk: immutable node log 会让 session schema 变重] → Mitigation: 只对 question/result/review 等正式节点做快照，不把每个临时 UI 状态都写进去。
- [Risk: 现有 roundGraph 与新 node log 短期并存会增加复杂度] → Mitigation: 把 roundGraph 降级为派生缓存，node log 成为唯一事实源。
- [Risk: 旧 session 没有 immutable node log] → Mitigation: 首次加载旧 session 时执行一次 migration，把已有 question history 和 branch states 转成 frozen snapshots，并标记来源为 migrated.

## Migration Plan

1. 在 session schema 中加入 `nodeLog`.
2. createSession 成功拿到 real runtime 第一题时，立即写入 root topic node 和 first question node。
3. submitAnswer 成功拿到下一题时，只追加新 node/edge。
4. explicit fork 成功时，为每个 child branch 追加 child question node。
5. 旧 session 首次读取时，从现有 `seedPrompt/history/currentMessage/branchRuns` 迁移出一份 immutable node log。
6. mainstage 改成优先读 node log；只有 migration 前的极短过渡阶段才允许读旧字段。
7. 完成后移除 `/app` 路径对 fake runtime 的静默 fallback。

## Open Questions

- product mode 失败文案是否要区分 `app-server unavailable` 与 `exec unavailable`，还是统一成“当前无法连接 Codex”？
- node log 是否需要额外记录 provider-side 原始 request id / turn id，供之后深度追踪？
- migrated 历史节点是否要在 debug-only inspector 里显示 `source: migrated`？
