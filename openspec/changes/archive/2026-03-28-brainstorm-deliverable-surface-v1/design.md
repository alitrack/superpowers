## Context

仓库里已经有三块关键能力：

- runtime 能生成带 `deliverable.sections` 的成熟 brainstorming result
- full-skill workflow 能在完成时产出 `spec + plan` bundle
- mainstage/canvas UI 已经能区分 question、review、completion 三种主态

但当前完成态仍然主要围绕 “bundle / spec / plan” 展开。对用户来说，这些是 supporting package，不是最终想消费的结果本体。结果面板真正应该承载的是：

- 这轮问题最后建议怎么做
- 为什么当前推荐路径胜出
- 还有哪些替代方向值得记住
- 风险/开放问题是什么
- 下一步行动是什么

同时，用户已经明确要求能直接拿到结果，而不是自己沿着 `location` 或 artifact path 去翻文件。

## Goals / Non-Goals

**Goals:**

- 让完成态主舞台优先展示成熟 brainstorming deliverable，而不是 bundle 预览。
- 给 completed session 一个稳定的结构化结果模型，供 UI、导出和 revisit 复用。
- 提供浏览器可直接使用的 markdown/json 结果导出入口。
- 保留 `spec + plan` 和 bundle 作为 supporting package，而不是把它们删除。
- 尽量复用现有 `summary.deliverable` / `summary.synthesis` 数据，避免发明新 workflow phase。

**Non-Goals:**

- 不新增决策树画布或更重的 spatial canvas 机制。
- 不改 brainstorm 的 question sequencing、skill orchestration、review loop 逻辑。
- 不把 spec/plan 生成功能降级或移除。
- 不引入外部存储、数据库或新的依赖。

## Decisions

### Decision: 完成主舞台改成 result-first surface，而不是 bundle-first surface

完成态的 anchor 区域优先展示 finished result：

- 顶部 hero：推荐标题 / 当前结论
- section cards：Problem Framing、Explored Approaches、Recommendation、Rationale、Risks / Open Questions、Next Actions
- supporting package：Design Spec、Implementation Plan、Result Bundle

**Why this over 继续把 bundle 当主卡片？**

- 用户需要的是“这轮脑暴最后得出了什么”，不是“系统又生成了哪些文件”。
- spec/plan 更像后续执行资产，应该降级成 supporting package。

### Decision: 结果面板使用 session-level normalized result snapshot，而不是在 UI 里临时重建

在 session manager 层增加一个 finished result snapshot：

- 优先取 `session.summary.deliverable`
- 从 `deliverable.sections` 和 `deliverable.synthesis` 归一化出 hero、sections、exports、supportingArtifacts
- full-skill completion 时把该 snapshot 附到 `artifact_ready`

**Why this over 让前端直接读 summary/artifact/raw markdown？**

- summary、artifact、workflow bundle 当前来自不同层；直接在前端拼会让逻辑分散。
- 统一 snapshot 后，API、UI、导出、回归测试都能使用同一份完成态数据。

### Decision: 导出接口新增用户结果层，而不是复用 current artifact 路径

新增两个浏览器结果导出读取面：

- `GET /api/sessions/:id/result` 返回结构化 JSON
- `GET /api/sessions/:id/result.md` 返回 markdown

保留现有 `GET /api/sessions/:id/artifacts/current` 作为 supporting bundle / 当前 artifact 入口。

**Why this over 复用 `/artifacts/current`？**

- full-skill completion 下 `/artifacts/current` 现在代表 bundle，而不是 finished result 本体。
- 用户结果导出和 supporting artifact 打开是两种不同语义，分路由更清楚。

### Decision: 完成态 UI 同时显示“结果”和“交付包”，但明确主次

UI 上保留三类 supporting asset：

- Result bundle
- Design spec
- Implementation plan

但把它们放到 secondary grid / package area，下沉到结果 sections 之后。

**Why this over 只显示结果，隐藏 spec/plan？**

- 用户最终既想看结论，也可能立即检查 spec/plan 是否可执行。
- supporting package 仍然有价值，只是不应该继续抢占 completion mainstage。

## Risks / Trade-offs

- [Risk: result snapshot 与 session.summary 内容漂移] → Mitigation: snapshot 只由 session manager 统一构建，前端不自行推导业务字段。
- [Risk: full-skill 与 summary-only completion 的字段形状再次分叉] → Mitigation: 两条路径都通过同一 `buildFinishedResultSnapshot` 生成导出与 UI 数据。
- [Risk: completion UI 变重，影响 question/review 主态] → Mitigation: 只改 completion mode 的 surface，不扩张 question/review 的信息量。
- [Risk: 增加导出路由后，测试只验证存在不验证内容] → Mitigation: 在 session-manager/server/browser 三层分别补结构、内容、页面动作断言。

## Migration Plan

1. 在 session manager 中增加 finished-result snapshot 构建与 result export 读取接口。
2. 在 full-skill completion payload 中附带 normalized result + export paths。
3. 在 server 增加 `/api/sessions/:id/result` 与 `/api/sessions/:id/result.md`。
4. 在 mainstage view 和 web shell 中把 completion surface 改成 result-first layout。
5. 用 regression tests 验证 completed session 的 UI 和导出行为。

## Open Questions

- 当前阶段不新增 open questions。若后续用户想把结果导出为 docx/pptx，再另起 change。
