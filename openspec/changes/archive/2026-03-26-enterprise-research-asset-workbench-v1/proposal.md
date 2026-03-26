## Why

当前 `brainstorm-server` 已经有 browser-first 工作台、session 持久化和 `spec + plan` 产物生成能力，但它仍然把“研究过程”当成一次性 brainstorming 会话，而不是可复用、可版本化、可审计的团队资产。对于企业战略 / 战投团队，这个缺口会直接导致同类研究重复做、证据链散落、判断过程不可继承。

现在需要把现有 browser product 从“能生成文档的 brainstorming UI”推进为“企业研究资产工作台”V1，让研究对象、发布快照、权限治理和审计边界都成为一等能力。

## What Changes

- Add a first-class research asset model with `Workspace`, `ResearchQuestion`, `Hypothesis`, `Evidence`, `Judgment`, `Conclusion`, `Checkpoint`, `ReviewRequest`, and `ResearchAssetBundle`.
- Add promotion and publication rules so the system enforces `Evidence -> Judgment -> Conclusion` progression, immutable published bundles, and preserved `Parked` / `Superseded` branches.
- Add browser workbench surfaces for research workspaces, published assets, publish review, and asset preview inside the existing `/app` product.
- Add governance boundaries for role-based access, review requests, audit logs, and agent actions that require human confirmation.
- Keep V1 focused on strategy / strategic investment research workflows; do not turn this into a generic AI workspace, realtime collaboration product, or enterprise identity platform.

## Capabilities

### New Capabilities
- `research-asset-workbench`: Covers the browser workbench for research sessions, asset library views, preview surfaces, and publish review flows.
- `research-asset-lifecycle`: Covers the research object model, state transitions, checkpoints, publication snapshots, versioning, and clone-for-reuse flows.
- `research-asset-governance`: Covers review requests, role-based permissions, audit logs, and high-risk agent confirmation boundaries.

### Modified Capabilities
- None.

## Impact

- Affects `skills/brainstorming/scripts/server.cjs`, `web-session-manager.cjs`, `web-app-shell.html`, `workflow-checkpoint-store.cjs`, and likely adds a dedicated research-asset store module.
- Expands `tests/brainstorm-server/` coverage for asset APIs, workbench rendering, governance checks, and publish lifecycle regression cases.
- Introduces new runtime data under the brainstorming web product data directory for assets, review requests, and audit/checkpoint references.
