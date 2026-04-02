## Context

当前 browser brainstorming 已经有几块可复用基础：

- `nodeLog` / `roundGraph` 已能持久化 topic、question、result 等历史节点，并且 question 节点在大多数主线推进场景下已经具备冻结快照属性。
- `branchRun` / `selectedBranchRunId` 已提供“从主线 question 物化候选分支并在树上切换上下文”的壳层能力。
- XYFlow + dagre 已经能自动排版图，但方向被硬编码为 `LR`，视觉上更像流程图而不是决策树。

但当前分支模型有两个根本限制：

1. `branchRun` 仍是本地摘要分支。`submitBranchRunAnswer()` 只会写 `resultSummary`，不会继续调用真实 runtime，因此无法成为真实后续会话。
2. 分支来源受限于当前主线分叉点，不能从任一历史 question 的任一 option 重开真实新分支。

用户现在要的是更强的一致性模型：

- question 节点一旦生成后永不变化；
- 从某个历史 question 上，选择另一个 option，就可以开一个新的真实分支继续往下跑；
- 各分支彼此独立，不互相污染；
- 整体画布以从上到下的决策树阅读方式呈现。

## Goals / Non-Goals

**Goals:**
- 让历史 question 节点成为稳定的 branch anchor，任一 option 都可从该节点开新分支。
- 让 branch 成为真实 branch session，而不是本地假摘要节点。
- 保持 mainline 和各 branch 的 runtime/provider 状态相互隔离。
- 让主输入区只服务当前选中的 branch 或 mainline。
- 把 XYFlow 布局切换为自上而下决策树，提升路径理解和分支对比的可读性。

**Non-Goals:**
- 不在这次变更里做无限并发自动跑所有 branch；先支持“可开多个，按选择继续其中一个”。
- 不把 mainline 改成可编辑回滚状态机；历史节点仍然只读。
- 不重写 structured host question contract。
- 不在这次变更里引入外部图布局服务或重型状态存储。

## Decisions

### 1. 把 `branchRun` 升级为真实 branch session 引用

新的 branch 数据不再只保存 `currentMessage/history/resultSummary` 这类轻量本地摘要，而要保存 branch 自己的最小独立 session 状态：

- `id`
- `parentQuestionId`
- `parentQuestionNodeId`
- `sourceOptionId`
- `sourceOptionLabel`
- `sessionState`: `backendMode / providerSession / strategyState / currentQuestionId / history / currentMessage / summary / artifact / processing`
- `status`
- `createdAt / updatedAt`

原因：
- 只有这样，branch 才能继续走真实 runtime，而不是在 host 内部提前终止。
- mainline 与 branch 的隔离边界也更清晰：每条 branch 只操作自己的 provider session snapshot。

备选方案：
- 继续沿用当前 `branchRun`，只在其上追加更多本地字段。放弃，因为它仍然没有真正独立的 runtime continuation 语义。

### 2. 从冻结 question 快照 + 选中 option 构造 branch continuation 输入

开 branch 时，不从“当前 mutable session”直接继续，而是从历史 question 的冻结快照和选中 option 重建 branch seed：

- question 节点提供 `messageSnapshot`
- source option 保存为 branch 的起点选择
- branch 首次 continuation prompt 由 `seedPrompt + 历史到该 question 的答案链 + 当前 question snapshot + 选中 option` 组成

对于 app-server backend：
- 先创建新的 branch thread，而不是复用 mainline thread
- 把到该节点为止的历史上下文和本次 option 选择注入 branch 首轮 turn

对于 exec backend：
- 用相同历史链重建 branch prompt

原因：
- 这保证 branch 真正从“当时那个 question”分叉，而不是从现在的 mutable mainline 状态分叉。
- question 冻结不变，branch 可以反复从同一 question 开多个不同 option 的独立分支。

备选方案：
- 尝试在同一个 thread 里 fork/resume conversation。暂不选，因为当前 host 已验证“新 thread + 持久化上下文”更稳，也更符合浏览器产品的隔离要求。

### 3. 保留一个全局主 session，branch state 挂在其下

不把每个 branch 提升成顶层 `/api/sessions` 记录，而是让 branch 作为主 session 的子会话集合：

- 顶层 session 仍对应一个 brainstorm topic
- `strategyState.branchRuns` 升级为 `branchSessions`
- API 仍围绕主 session 获取和渲染整棵树
- 当前选中 branch 通过 `selectedBranchRunId` 或新的 `selectedBranchSessionId` 指示

原因：
- 用户要的是“单次头脑风暴会话内的多分支树”，不是多个完全割裂的顶层 session 列表。
- 主树、历史、导出、processing 轮询仍可沿用现有产品壳层。

备选方案：
- 把 branch 直接做成顶层 session。放弃，因为 Recent Sessions 会被污染，也不符合“同一 topic 下多分支”的心智。

### 4. 主输入区始终只服务当前上下文

规则：
- 未选中 branch 时，主输入区服务 mainline 当前问题。
- 选中 branch 后，主输入区只显示该 branch 的当前问题与选项。
- 若 branch 已完成，则只读展示其结果，不可再提交。
- 从历史 question 节点开新 branch 是显式动作，不隐式覆盖当前 branch。

原因：
- 这和用户明确要求一致：树驱动切换，输入区只服务当前 branch。
- 可以避免并发输入污染。

### 5. XYFlow 改为自上而下决策树布局

布局决策：
- `dagre rankdir` 从 `LR` 改为 `TB`
- topic root 在最上
- 主线 question/result 垂直向下
- 某个 question 下的多个 branch 作为该节点的下一层横向展开
- 继续中的 branch 再向下延展
- handle 位置改成 `target=Top / source=Bottom`

必要时再补：
- mainline 与 branch 使用不同层级间距
- overview/focused 两种模式只调整间距，不改变整体树方向

原因：
- 这最贴近“决策树”阅读习惯，也和用户对 node0/node1/node2 的理解一致。

备选方案：
- 保持 LR，只做样式优化。放弃，因为方向本身就错。

## Risks / Trade-offs

- [Risk] branch session 状态复制不完整会导致 branch continuation 偏离原问题 -> Mitigation: 明确以冻结 question snapshot + 截止该节点的历史链作为唯一 branch seed，并补回归测试。
- [Risk] 主 session 文件体积会变大 -> Mitigation: branch 仅保存必要 session 状态，不复制无关 UI 派生数据；必要时后续再拆分存储。
- [Risk] top-down 布局后大节点可能上下撑得太长 -> Mitigation: 保留 focused/overview 间距模式，并在 node dimension 估算上针对纵向布局做微调。
- [Risk] 真实 branch 继续 runtime 后，旧的 branchMaterialize 语义测试会失效 -> Mitigation: 用新测试明确要求“branch 能继续到新 question/result”，删除或升级旧的假分支假设。

## Migration Plan

1. 更新 OpenSpec proposal/specs/tasks，固定真实 branch session 和 top-down tree 语义。
2. 重构 session state：
   - `branchRun` -> `branch session` 最小独立状态
   - 保持旧数据读取兼容，必要时在 `loadSession` 做迁移
3. 实现从历史 question/option 开 branch 的 API 和 session-manager helper。
4. 将 branch continuation 接到真实 runtime。
5. 切换 XYFlow 为 `TB` 布局并调整 node handles。
6. 运行回归测试并手动验证：
   - 历史 question 上可从不同 option 开多个真实 branch
   - 切换 branch 后只显示该 branch 当前问题
   - mainline 不被 branch 污染
   - 树整体从上到下显示

## Open Questions

- branch 完成后，是否需要允许在同一 branch 上继续“再开分支”；本次先不扩展，保持从冻结 question 节点显式开新 branch。
- 是否需要在树上为已用 option 显示“已存在 branch”徽标；实现时若代价低可以顺手加，但不是这次主目标。
