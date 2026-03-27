## Why

已归档的 `enterprise-research-asset-workbench-v1` 已经建立了研究资产工作台的核心骨架，但经过实现复盘与实际体验检查，V1 仍有几处“规范已写、实现未闭环”的硬缺口。现在需要尽快把这些缺口补齐，避免后续继续在不稳定边界上叠加新体验层。

## What Changes

- 补齐 `ReviewRequest` 的最小闭环，支持从 `Open` 进入 `Resolved` 或 `Rejected`，并保留请求历史。
- 补齐 `Hypothesis` 的显式 `Parked` / `Superseded` 生命周期动作与对应 checkpoint，而不是只读取已有状态。
- 将浏览器 workbench 从默认硬编码 `Owner` 身份改为可切换的最小角色入口，使 `Owner / Editor / Viewer / Auditor` 的差异可以在产品层被验证。
- 将当前本地未提交的“研究画布强化试验”排除在本次 change 之外，保持 V1 仍是 skeleton 收口，而不是进入下一阶段产品探索。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `research-asset-governance`: review request 需要支持处理完成后的状态迁移，并允许 workbench 在不同角色下验证治理边界。
- `research-asset-lifecycle`: hypothesis 需要具备显式 `Parked` / `Superseded` 转换与 checkpoint 记录，而不是仅在发布快照中保留状态。
- `research-asset-workbench`: 浏览器 workbench 需要提供最小角色切换入口，并继续保持 V1 skeleton，而不是引入新的复杂画布交互范围。

## Impact

- 影响 `skills/brainstorming/scripts/web-session-manager.cjs`、`research-asset-store.cjs`、`research-asset-model.cjs`、`server.cjs`、`web-app-shell.html`。
- 影响 `tests/brainstorm-server/` 下的 governance、lifecycle、web-product 回归测试。
- 影响 `openspec/specs/research-asset-governance/spec.md`、`openspec/specs/research-asset-lifecycle/spec.md`、`openspec/specs/research-asset-workbench/spec.md` 的规范增量。
