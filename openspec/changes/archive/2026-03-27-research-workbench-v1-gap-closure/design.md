## Context

`enterprise-research-asset-workbench-v1` 已经把研究资产工作台的基础对象、最小治理和浏览器 workbench 骨架落了地，但在后续自审中暴露出三类问题：

- 有些 requirement 已经写进主 spec，却没有完整实现，比如 `ReviewRequest` 的完成状态与 `Hypothesis` 的显式 `Parked / Superseded` 迁移。
- 浏览器 workbench 目前把所有请求都固定成 `Owner` 身份，导致治理要求只能在后端测试里成立，前端无法真实验证。
- 本地工作树上已经开始出现强化“研究画布感”的试验 UI，但这不属于 V1 skeleton 的正式边界，继续叠加会让验收标准失焦。

这次 change 的目标不是继续做“更有感觉”的第二阶段产品探索，而是把 V1 收回到一个可验证、可继续迭代的稳定基线。

## Goals / Non-Goals

**Goals:**

- 补齐 `ReviewRequest` 的最小处理闭环：`Open -> Resolved / Rejected`。
- 补齐 `Hypothesis` 的显式 `Parked / Superseded` 生命周期动作与 checkpoint。
- 让浏览器 workbench 提供最小角色切换入口，以便验证 `Owner / Editor / Viewer / Auditor` 的产品层差异。
- 明确本次 change 不吸收当前未提交的“研究画布强化试验”。

**Non-Goals:**

- 不引入真正的决策树 / 节点连线 / 复杂画布交互。
- 不新增更复杂的身份体系、审批流引擎或通知中心。
- 不扩展新的研究对象类型或新的发布模型。

## Decisions

### Decision: ReviewRequest 以“最小状态更新”闭环，而不是扩成审批引擎

本次只补：

- `Resolved`
- `Rejected`
- 可选 `resolutionNote` / `resolvedAt` / `resolvedBy`

同时增加服务端更新入口与最小 UI 展示反馈。

**Why this over完整审批系统?**

- 当前缺口是“request 无法完成处理”，不是“审批流不够复杂”。
- 先闭合最小状态机，能让治理能力从静态列表变成真正可用的流程。

### Decision: Hypothesis 的状态迁移必须是显式动作

本次补两个显式动作：

- `parkHypothesis`
- `supersedeHypothesis`

每次迁移都必须：

- 保留原分支在 workspace 历史中
- 记录 `hypothesis_parked_or_superseded` checkpoint
- 更新 `updatedAt` 与最小 reason metadata

**Why this over继续只读状态?**

- 规范要求的是“当分支被停放或替代时，系统记录历史和 checkpoint”，不是“系统能读取一个已经停放的对象”。
- 没有显式动作，生命周期 requirement 实际上没有被兑现。

### Decision: 浏览器 workbench 用“角色切换器”验证治理，而不是继续硬编码 Owner

浏览器 workbench 增加一个本地角色切换入口，至少覆盖：

- `Owner`
- `Editor`
- `Viewer`
- `Auditor`

其作用是切换前端请求头和可见状态，不承担真实身份认证。

**Why this over马上接真实身份系统?**

- 这次 change 只是为了让 V1 的治理要求在产品层可验证。
- 真实认证属于后续更大范围，不应阻塞当前 skeleton 收口。

### Decision: 将当前本地 research canvas 强化试验排除出本次 change

本次 change 只允许保留已归档 V1 的 panel-based skeleton：

- 资产列表
- publish review
- bundle preview
- audit / review queue

不把当前本地未提交的“Decision Spine / Research Canvas”主舞台纳入正式范围。

**Why this over顺手继续推进体验?**

- 这会把“V1 缺口修复”和“V1.1 产品探索”混在一起。
- 当前最重要的是先形成一个可验收的稳定基线。

## Risks / Trade-offs

- [Risk: 角色切换器被误解为真实鉴权] → Mitigation: 在 UI 文案中明确这是 V1 治理视角切换，不代表生产级认证。
- [Risk: ReviewRequest 更新逻辑过快变复杂] → Mitigation: 只支持最小状态更新，不引入链式审批。
- [Risk: hypothesis 状态迁移补齐后暴露更多上层交互空缺] → Mitigation: 本次先落服务端与测试，前端只做最小入口或最小展示，不扩画布编辑。
- [Risk: 回退本地 canvas 试验让页面“更朴素”] → Mitigation: 接受这一点，把“更强体验”作为下一条独立 change 处理。

## Migration Plan

1. 回退当前未提交的 research canvas 强化试验，恢复到已归档 V1 skeleton UI 基线。
2. 在 model/store/manager/server 中补齐 `ReviewRequest` 的状态更新能力。
3. 在 manager/server 中补齐 `Hypothesis` 的 `Parked / Superseded` 显式动作与 checkpoint。
4. 在 workbench 中增加最小角色切换器，并将所选角色用于 API 请求与只读展示。
5. 增加 targeted tests，最后跑 `npm --prefix tests/brainstorm-server test`。

## Open Questions

- `ReviewRequest` 的状态更新是否需要额外记录 `resolutionNote` 到 audit details？本次建议支持，但不把 note 作为必填。
- `Viewer` 是否允许查看 published bundle preview 与 workspace 列表但完全不显示治理写入口？本次建议允许读、不允许写。
