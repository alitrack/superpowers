## Context

前几个 brainstorming 相关 change 已经分别解决了这些问题：

- browser-first 壳子
- seeded session 入口
- 基于 phase 的 brainstorming strategy
- skill excerpt 注入
- real runtime 的 skill bootstrap 指令

这些都是真进展，但用户指出的根问题仍然成立：它们拼起来还是一个“越来越像成品的原型”，而不是一个用户可以一次验收的 finished product。

当前缺口主要有三类：

1. **完成品门槛缺失**
   - runtime 一旦进入 handoff，就可以产出 `summary` / `artifact_ready`
   - 但 handoff 现在并不等于“成熟 brainstorming 成品”
   - 所以系统仍可能过早结束，输出一个逻辑上正确、产品上却不够完整的结果

2. **来源不可审计**
   - 即便 real runtime 现在会被要求去读 skills，用户和开发者仍无法从 session 结果里直接确认
   - 某道 question 到底来自真实 Codex + 当前 skills，还是 fallback excerpt / fake path
   - 这会直接破坏用户对“这是不是你们瞎写的”这一层信任

3. **开发验收标准不对**
   - 过去的变更主要按“某个局部行为是否成立”来推进
   - 用户现在要的是 “给我一个完整成品”，所以新的 change 必须围绕 end-to-end deliverable bar 来拆任务和验收

## Goals / Non-Goals

**Goals:**

- 明确定义“finished brainstorming product” 的最小可验收完成品。
- 让 runtime 只有在产出成熟 brainstorming deliverable 后才允许 `summary` / `artifact_ready` 收口。
- 让 visible question 和 final artifact 都带有可审计 provenance，至少对开发模式/API 可见。
- 保持用户界面仍然是产品化的浏览器体验，不暴露 CLI、协议或调试细节给普通用户。
- 把实现拆成可监控、可执行、可验证的垂直任务切片，避免再次出现“做了很多局部点，但没有一个完整成品”。

**Non-Goals:**

- 不在这次 change 里引入多人协作、分支树画布或 deep research。
- 不把 brainstorming skill 的后续 repo-writing / spec-review / writing-plans 全部搬进普通用户界面。
- 不要求普通用户看到 provenance 细节；这层主要服务于开发验证和产品信任校验。

## Decisions

### Decision: 用“完成品 gate”定义会话结束，而不是用 phase 结束定义会话结束

新的 runtime 不再把 `phase === handoff` 直接当作“可以结束”的条件。  
会话只有在满足 deliverable completeness gate 后才允许发出完成消息。

完成品至少必须包含这些部分：

- 问题 framing
- 2-3 个明确的方案/方向
- 推荐路径与取舍理由
- 结构化的设计/执行草案
- 风险 / 未决问题
- 下一步建议

**Why this over继续沿用 handoff = done?**

- `handoff` 只是内部状态，不能代表用户真正拿到了成熟成果。
- 用户在意的是“最后是不是一个像样的脑暴完成品”，不是 runtime 是否进入某个内部 phase。

### Decision: 问题生成和结果生成都要记录 provenance

为每个 visible question 和 final deliverable 增加 provenance 记录，至少包含：

- `backendMode`: `app-server | exec | fake`
- `generationMode`: `real-skill-runtime | fallback-excerpt | fake-flow`
- `requiredSkills`: 当前要求加载的 skill 文件列表
- `threadId` / `turnId` 或等价 provider trace
- `timestamp`
- `completionGateVersion`

这些 provenance 默认保存在 session state 中，并通过开发向 API 暴露；普通用户 UI 可以隐藏。

**Why this over只在日志里看?**

- 日志不是产品级证据，也不便于稳定回归。
- 用户已经明确提出“不知道 question 是不是瞎写的”，这要求 provenance 成为会话数据的一部分，而不是临时日志。

### Decision: Completion message 必须承载成熟 deliverable，而不是轻量 recap

`summary` 和 `artifact_ready` 的定位调整为：

- `summary`: 无文件输出时的成熟 brainstorming deliverable
- `artifact_ready`: 有文件输出时的成熟 brainstorming deliverable 引用

两者都必须指向同一套 deliverable contract，而不是一个“快速摘要”和一个“正式成品”两个完全不同层级的输出。

**Why this over只增强 artifact path?**

- 有些 session 首版不一定要写文件，但也必须能拿到成熟结果。
- 如果 `summary` 仍然只是弱结果，那产品依旧是半成品。

### Decision: 用户界面默认围绕 finished artifact 展示，开发验证通过单独 surface 查看 provenance

UI 的主路径仍然应该是：

- 输入议题
- 回答必要问题
- 查看收敛出的成熟成品

而不是：

- 让用户看一堆状态字段、调试信息、provider 细节

因此 provenance 不进普通主界面文案，优先通过：

- session API
- 开发模式面板
- 测试夹具和 smoke evidence

来验证。

### Decision: 任务按“能形成完整垂直能力”的切片来拆，而不是按文件/函数散拆

这次 tasks 分成四类垂直切片：

1. 完成品 contract 与 gate
2. provenance 与 inspection
3. UI/host 对 finished artifact 的展示
4. acceptance gates 与 release verification

**Why this over继续按单文件修补?**

- 用户当前最大的痛点就是“每次只收到半成品”
- 如果任务还是按文件或零散 helper 拆，apply 阶段很容易再次完成很多局部点，却没有形成一个可演示、可验收的完整能力

## Risks / Trade-offs

- [Risk: completion gate 过严，session 很难结束] -> Mitigation: 先定义最小成熟 deliverable contract，并用 fixtures 校准，而不是追求一步到位的大而全文档。
- [Risk: provenance 信息污染用户体验] -> Mitigation: provenance 默认只进入 session state / developer-facing surfaces，普通用户主界面不展示底层实现细节。
- [Risk: summary/artifact contract 变复杂后，旧测试大量失效] -> Mitigation: 先在 spec 中定义统一 contract，再用 fixtures 驱动逐步回归。
- [Risk: 继续沿用当前 phase 状态仍会提前收口] -> Mitigation: 将 phase 与 completion gate 分离，手动要求 gate 满足才允许 completed message。
- [Risk: “一次看到结果”被误解成零交互] -> Mitigation: 明确本 change 的目标是“给开发和验收一次看到完整成品”，不是要求产品彻底取消用户问答。

## Migration Plan

1. 先定义 finished deliverable contract 与 provenance contract。
2. 改 runtime completion logic，让 gate 决定完成，而不是 handoff phase。
3. 改 summary/artifact generation 与 session persistence。
4. 改 host/UI，让主界面围绕 finished artifact 呈现，并把 provenance 放到开发向 surface。
5. 加 acceptance fixtures、quality bar、real smoke，只有通过完整 gate 才视为完成。

## Open Questions

- provenance 首版是否只做 API，不做开发面板？
- first-pass finished deliverable 是否必须始终输出文件，还是允许高质量 `summary` 作为无文件完成态？
- completion gate 的 section 数量是否需要按 completionMode 区分，还是统一一个最小 contract？
