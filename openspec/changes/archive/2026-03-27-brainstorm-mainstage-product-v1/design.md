## Context

这条 change 不是再给 runtime 加能力，而是把已经存在的能力重新组织成一个真正可读、可答、可完成的主舞台。当前 repo 已经具备：

- seed-first 入口
- 真实 Codex runtime 与 skill bootstrap
- 更像 brainstorming 的 facilitation strategy
- finished deliverable completion gate
- full-skill workflow 到 `spec + plan`

但用户在页面里看到的仍然是多个面板并列，主次不够明确。根据当前收敛结果，这条 change 的第一优先级是“当前唯一活动问题 + 作答区”，第二优先级是“历史轻量可见”，所以本次设计必须围绕视觉层级和交互路径收口，而不是增加更多机制。

## Goals / Non-Goals

**Goals:**

- 让当前唯一活动问题或审批决策成为页面绝对主角。
- 默认只展示最近 `2-3` 步上下文，而不是整页铺开完整历史。
- 让完成态的 `spec + plan` 结果拥有清晰、可审阅的专属主视图。
- 保留“开始新的 brainstorm”入口，但不打断当前会话主舞台。
- 尽量复用现有 session / transport / workflow 数据，不新增不必要的后端协议。

**Non-Goals:**

- 不引入节点画布、决策树画布或新的视觉编排系统。
- 不改现有 question / summary / artifact_ready transport contract。
- 不改内部 workflow 策略、review loop 机制或 provenance 数据模型。
- 不把 inspection / provenance / automation 细节重新暴露回默认用户 UI。

## Decisions

### Decision: 主舞台采用 question-first 单核心布局

主舞台中心区域只服务于一个对象：

- 当前活动问题
- 或当前审批/确认决策
- 或完成态结果

同一时刻只允许其中一种状态成为视觉中心。其他信息，例如旧 session、完整历史、workflow 细节、侧边面板，只能作为配角存在。

**Why this over 保持当前多面板并列?**

- 用户已经明确把“当前唯一活动问题”定为第一优先级。
- 如果继续并列多个强面板，产品仍然会给人“功能很多但不知道先看哪”的感觉。

### Decision: 历史默认只展示最近 2-3 步，完整历史按需展开

默认视图只保留最近 `2-3` 个已完成步骤，形式可以是轻量卡片、时间线片段或步骤条。完整历史仅在用户主动展开时出现。

**Why this over 全量历史并重?**

- 选 `3` 会重新把视觉注意力拉回“过程台”，冲淡当前问题。
- 选 `1` 又会让用户失去必要上下文。
- `2` 是最符合当前产品阶段的平衡点。

### Decision: 完成态切换为 dedicated result mode，而不是继续堆在右侧 panel

当会话达到 finished `spec + plan` bundle 后，主舞台切换到专门的结果视图：

- 顶部保留会话标题与新建入口
- 主区域展示结果 bundle
- 侧边仅保留必要的轻量上下文与回看入口

**Why this over 继续把结果放进现有 panel?**

- 当前完成态即使技术上完整，视觉上仍然像“又多了一个面板”。
- 完成品必须有清晰的终态仪式感，用户才能理解这轮已经真正结束并形成交付。

### Decision: 辅助面板降级为 secondary surfaces

旧 session 列表、完整历史、workflow detail、可能的附加工作台信息，都移到次级区域：

- 侧边栏
- 可折叠抽屉
- 非默认展开的 section

**Why this over 删除这些信息?**

- 这些信息仍然有价值，尤其对回看和开发验证有帮助。
- 但它们不应该和当前问题争夺第一视觉层级。

## Risks / Trade-offs

- [Risk: 历史展示过轻导致用户迷失上下文] → Mitigation: 默认保留最近 `2-3` 步，并提供明确的“查看完整过程”入口。
- [Risk: 完成态切换太强导致用户难以回看中间过程] → Mitigation: 在 completion mode 中保留回看最近步骤和完整历史的入口。
- [Risk: 只是换布局，没有真正改善理解成本] → Mitigation: 所有信息架构决策都围绕“进入页面后三秒内知道当前该回答什么”来验收。
- [Risk: 实现时顺手继续加入更多产品层机制] → Mitigation: 本次限制为 UI 信息层级与展示模式重构，不扩展 runtime 能力边界。

## Migration Plan

1. 在现有 web shell 上提炼 mainstage view state，区分 in-progress question mode、review checkpoint mode、completion mode。
2. 重构页面布局，把当前问题/决策卡片提升为主区域唯一核心。
3. 把历史收敛为 recent trail + expandable full history。
4. 把最终 `spec + plan` 结果切成 dedicated completion surface。
5. 增加针对视觉层级与流程稳定性的浏览器回归测试。

## Open Questions

- recent trail 更适合做成纵向步骤卡片，还是顶部/侧边的水平 step chips？本次实现时可先按现有样式系统选最小复杂度方案。
- 完成态是否需要在 spec 与 plan 之间切 tab，还是直接上下分段展示？优先选择更利于审阅的一种，但不新增复杂交互。
