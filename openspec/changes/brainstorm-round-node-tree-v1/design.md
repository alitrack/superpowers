## Context

当前实现的主要问题已经不是“能不能点”或“能不能 materialize branch-run”，而是树的语义模型本身仍然不符合用户对头脑风暴推进过程的理解。用户期望的是：

1. `node0` 是原始脑暴问题。
2. 系统产生 `node1 = Q1`。
3. 用户回答后，系统产生 `node2 = Q2`。
4. 继续回答后，系统产生 `node3 = Q3`。

也就是说，树上的主节点应该首先表示“这一轮正式问题/状态”，而不是“这一轮的所有选项”。只有当用户显式要求“把几个方向展开并行探索”时，树才应该从某个 round node 裂出子树，而且这些子树节点表示的是各自分支上的“下一轮问题”，不是触发分支的原始 option 卡片。

旧的 `brainstorm-tree-semantics-v1` 解决了“option != branch-run”，但它仍然保留了 option node 常驻画布的前提，这会继续制造“当前候选”和“已经发生的后续问题”混在一起的视觉误解。这次 change 要把语义再收紧一层：**只有 round node 才是主画布的稳定节点。**

## Goals / Non-Goals

**Goals:**
- 让 `/app` 的树先成为一条可读的主干：`node0 -> node1 -> node2 -> node3`。
- 让每个 round node 对应一个正式 question / review / completion state，而不是一个候选答案集合。
- 让 option 退出主画布，只作为当前 active round node 内部的回答控件。
- 让显式 fork 成为唯一的分支创建方式，并把分支子节点建模为“子 round node”。
- 让 reload、切换分支、focused/overview 都基于 round lineage，而不是基于临时拼装的 option/branch 混合图。

**Non-Goals:**
- 这次不追求自由画布、任意拖拽布局或 mind-map 风格编辑。
- 这次不做任意历史节点的一键 retroactive fork；V1 只支持被标记为可 fork 的当前 round。
- 这次不重做整个视觉风格，只重做树语义和最必要的展示层次。
- 这次不允许多个 round 同时可回答；任一时刻仍然只有一个 active round。

## Decisions

### Decision: 主画布的稳定节点改为 `topic / round / result`

主画布不再把 option 作为常驻 graph node。稳定节点只保留三类：

- `topic`: 用户最初抛出的脑暴问题
- `round`: 一轮正式 question / review / branch continuation state
- `result`: 最终收敛结果或完成节点

option 仍然存在，但它是 active round node 内部的 answer controls，不再是与 round 并列的树节点。

**Why this over 保留 option node?**

- 用户理解的是“问答推进轮次”，不是“画布上同时摆着候选卡片”。
- option node 一旦常驻，时间顺序和逻辑顺序就会混杂，主干不可读。
- round node 语义更稳定：每回答一次，才产生一个新的后续节点。

### Decision: 回答结果显示在边或 inspector 上，而不是生成答案节点

用户答案不是新的大节点。它应该附着在 round 之间的连接关系上，例如：

- edge label
- source-answer chip
- inspector 中的 round transition details

这样可以保留“这一轮如何走到下一轮”的信息，同时不把树膨胀成“问题节点 + 答案节点 + 选项节点”的混合图。

**Why this over 为每个 answer 单独建节点?**

- 单独 answer node 会把树宽度和复杂度迅速放大。
- 用户最关心的是“现在到第几轮了”和“为什么走到了下一轮”，不是想看每个答案都占一个大卡片。

### Decision: 显式 fork 只产生“子 round node”，不产生“option branch node”

当 round 被标记为可 fork，且用户显式触发 fork 时：

1. 父节点仍然是当前 round node。
2. 每个被展开的方向生成一个子 round node。
3. 这个子 round node 的内容是该分支上的下一轮 question/state。
4. 原始 option 只作为 fork source metadata 挂在这个子 round 上。

**Why this over 把 option 卡片直接当 branch node?**

- option 只是触发条件，不是后续状态本身。
- 用户要看的不是“选了 A / C”，而是“沿着 A 走下去，系统下一步问了什么”。
- 只有子 round node 才能承载真实的 branch current question、history 和 result。

### Decision: 在 session state 中持久化最小 round graph，而不是继续临时推导整棵树

这次引入一个最小 round graph 持久化模型，例如：

- `rounds[]`
- `activeRoundId`
- `rootRoundId`
- `sourceAnswer` metadata
- `forkGroupId` / `parentRoundId`

每个 round 至少持久化：

- `id`
- `kind`
- `parentRoundId`
- `questionId`
- `message`
- `sourceAnswer`
- `status`
- `branchContext`（是否主干/哪个 fork group）

旧的 `history + currentMessage + strategyState` 仍然保留，但不再承担“推导整棵可视树”的唯一职责。

**Why this over 继续从现有 session 字段推导?**

- 当前问题正是因为前端一直在“猜树”，导致 option、branch、future state 被混在一起。
- round graph 是最小但明确的可视化语义源，比继续在 renderer 里做 heuristic 安全。
- reload、切 branch、恢复 active context 都会变得更确定。

### Decision: 仍然保持单 active round，树选择只切上下文，不让多个节点同时可回答

即使显式 fork 生成多个子 round，任一时刻也只有一个 active round：

- 默认是当前主干 round
- 或用户从树上选中的某个 branch round

其他 round 只可 inspect，不可同时回答。

**Why this over 多输入并行回答?**

- 头脑风暴的产品目标是“可理解的推进”，不是把多个表单同时摊开。
- 单 active round 能保持 structured host、review gate、artifact generation 的一致性。

## Risks / Trade-offs

- [Risk: 引入 round graph 持久化会让 session schema 变复杂] → Mitigation: 只引入最小字段集，把它限制在画布语义恢复所需范围内，不把完整 workflow 状态复制两份。
- [Risk: 旧 session 没有 round graph，升级时会出现兼容问题] → Mitigation: 采用 lazy migration，在首次加载旧 session 时从 `seedPrompt + history + currentMessage + branchRuns` 构建最小 round graph 并回写。
- [Risk: 显式 fork 后，子 round 的初始 message 获取时机不清晰] → Mitigation: fork 成功时立即为每个 child round 绑定对应的 branch current message，不允许只创建空壳 branch 节点。
- [Risk: 画布从 option-heavy 改成 round-heavy 后，用户短期内会觉得“节点变少了”] → Mitigation: 把选中的答案、fork source 和 lineage 通过 edge label / inspector 清晰补回，而不是靠节点堆数量制造信息量。

## Migration Plan

1. 在 session manager 中引入 round graph state 和 lazy migration。
2. 读取旧 session 时，如果缺少 round graph，则从现有字段构建：
   - `node0 = topic`
   - 已回答 history 生成顺序 round chain
   - 当前 `currentMessage` 生成 active round
   - 已有 `branchRuns` 映射为 child round lineage
3. 前端 graph adapter 改为完全从 round graph 渲染，不再直接把 current options 映射成 persistent nodes。
4. 旧字段在过渡期保留，用于兼容 runtime/summary 逻辑；新功能以 round graph 为准。
5. 如果回归风险过大，可以临时回退到“只显示 trunk chain，不显示 fork subtree”，但不允许回退到“option node 常驻画布”。

## Open Questions

- V1 的 edge label 信息量要控制到什么程度最合适：只显示选中的 label，还是同时显示短说明？
- 显式 fork 后，默认 active round 是保留在父主干，还是自动切到第一个子 branch round？当前倾向保留父主干，减少突兀跳转。
- overview 模式里是否要显示所有已完成 branch rounds，还是只显示最近一次 fork group 的子树？当前倾向显示所有已 materialize 的子树，但默认折叠已完成细节。
