## Context

当前仓库已经有可运行的 browser brainstorming shell、XYFlow 主画布、session/history/round graph、以及 `conversation` 与 `full_skill` 两类后端 workflow 模式。服务端默认 workflow mode 实际是 `conversation`，但浏览器创建 session 时硬编码传入了 `workflowMode: 'full_skill'`，把所有 artifact session 强制带进 spec/plan 产线。

这带来三个问题：

- UI 越界成了 workflow orchestrator，而不是 Codex + skills 的可视化宿主。
- 对写作、研究、战略判断等非软件设计 prompt，交付物会被错误扭成 spec/plan bundle。
- 主画布仍承载了过多“流程说明”语义，削弱了它作为问题流/分支流可视化器的作用。

## Goals / Non-Goals

**Goals:**
- 让浏览器默认 session 回到 skill-first / runtime-first 行为，不再默认强制 `full_skill`。
- 保留显式 `full_skill` 能力，但只在调用方明确要求时启用。
- 让结果导出尽量忠实反映 runtime 的真实 title / markdown / deliverable sections。
- 让 UI 回到“薄壳”定位：图、分支、状态、导出是直观载体，不替 skill 做交付物重写。
- 收敛主画布的流程干预元素，继续保留对分支和历史回看的友好性。

**Non-Goals:**
- 不在这次变更里重新设计新的 skill 体系或新的 prompt 分类器。
- 不在这次变更里删除 `full_skill` 后端能力。
- 不在这次变更里新增用户可配置的复杂 workflow 切换面板。
- 不在这次变更里重构 Codex runtime 协议本身。

## Decisions

### 1. 浏览器默认不再强制 `full_skill`

浏览器创建 session 时不再固定发送 `workflowMode: 'full_skill'`。如果前端未显式提供 workflowMode，服务端继续使用已有默认值 `conversation`。

原因：
- 这是把 UI 从“流程发动机”降回“交互宿主”的最低成本、最高价值改动。
- 服务端默认行为已经存在，不需要引入新的模式判断器。

备选方案：
- 按 prompt 自动判断“文章/产品/代码”再切 workflow。放弃，因为这仍然是 UI/产品层替 skill 做解释。
- 继续保持 full_skill 默认，同时只对部分 prompt 特判。放弃，因为仍然违背“不要额外干预”的边界。

### 2. `full_skill` 只在显式请求时保留 spec/plan bundle

`full_skill` 仍然存在，并继续负责 `spec -> review -> plan` 这一套；但只有显式 workflowMode 请求或未来单独入口才进入这条路径。普通 browser session 只消费 runtime 的 `question / summary / artifact_ready`。

原因：
- 可以保留现有能力，不破坏已有 API 和测试资产。
- 把“软件设计产线”从默认行为改为可选行为。

备选方案：
- 彻底删除 full_skill。放弃，因为已有实现和测试已证明这条链仍有价值，只是不该默认。

### 3. 导出结果优先忠实反映 runtime 产物

对于普通 conversation 模式：
- 如果 runtime 返回 `artifact_ready.artifactMarkdown`，直接持久化该 markdown。
- 如果 runtime 只返回 `summary`，fallback markdown 仍可由服务端生成，但应优先使用 runtime title / deliverable sections / summary text，弱化固定的“Structured Brainstorming Result”包装。

对于 full_skill 模式：
- 继续导出 spec/plan bundle，因为这是该模式的真实产物。

原因：
- 浏览器层的职责是保存和展示，不是重写交付物。

备选方案：
- 保持统一“Structured Brainstorming Result”模板。放弃，因为会继续掩盖真实产物类型。

### 4. 主画布只保留轻量 workflow chrome

- `Workflow Stage` 移到左侧 rail。
- `Focused View / Overview` 保留，但作为 graph header 内的轻量 segmented control。
- `Request Status` 继续弱化，不让它成为主画布的流程主角。
- 折叠历史时，graph edge 必须重连到第一个可见节点，不能出现断线。

原因：
- 这些控件属于壳层导航和状态反馈，不应和 graph 本体竞争视觉主导权。

## Risks / Trade-offs

- [Risk] 现有一些基于浏览器默认 full_skill 的心智会变化 → Mitigation: 保留 API 层显式 `workflowMode: full_skill` 支持，并在测试里同时覆盖默认和显式两条路径。
- [Risk] conversation 模式的 artifact markdown 失去统一格式后，跨场景样式可能不一致 → Mitigation: 保留最小公共 header，但 title/body 以 runtime 为准。
- [Risk] 已创建的旧 full_skill session 仍然会展示 bundle → Mitigation: 不做破坏性迁移，只保证新 session 默认行为正确；旧 session 按其创建时语义继续展示。

## Migration Plan

1. 更新 OpenSpec proposal / specs / tasks，固定新的产品边界。
2. 修改浏览器创建 session 的默认请求体，不再强制 `workflowMode: 'full_skill'`。
3. 调整 session manager 的 artifact markdown 生成逻辑，让 conversation 导出更忠实于 runtime。
4. 调整 shell/mainstage，让 stage chrome 回到左 rail、画布控件更轻。
5. 运行回归测试并手动验证：
   - 普通 prompt 默认不再落到 spec/plan
   - 显式 full_skill 仍能生成 spec/plan bundle
   - 折叠历史时连线不断

## Open Questions

- 是否需要后续增加一个“高级模式 / 开发模式”入口，显式创建 full_skill session，而不是只保留 API 参数。
- conversation 模式的 fallback markdown 是否要进一步支持“直接使用 runtime title 作为文档主标题”而不保留统一产品头。
