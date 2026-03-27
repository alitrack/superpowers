## Why

当前 `brainstorm-server` 已经能做出更像成品的 brainstorming 对话，但它仍然停留在“对话阶段成品”，没有把 Codex + `brainstorming` SKILL 的完整价值带到 UI 里。对于非程序员用户，离开 CLI 只有在浏览器能把他们从问题提出一路带到可审阅的 `spec + plan` 时才有意义，而不是只给一个 summary。

## What Changes

- Add a full-skill workflow mode that runs the complete `brainstorming` lifecycle through `writing-plans` completion inside the browser product.
- Introduce user-facing workflow stages and approval gates phrased in non-technical language while hiding internal engineering actions such as skill loading, reviewer dispatch, subagents, and git-backed checkpoints.
- Add automation-boundary rules so context exploration, draft writing, spec review, and plan generation are handled automatically, while output-type changes or external side effects still require user confirmation.
- Change V1 completion from “brainstorm summary/artifact” to a reviewable `spec + plan` bundle.
- Persist workflow stage, generated artifacts, hidden automation steps, and blocked states so sessions can be resumed, debugged, and verified.

## Capabilities

### New Capabilities
- `brainstorm-skill-workflow-orchestration`: Covers backend orchestration of the full brainstorming skill workflow through spec writing, review, user approval, and plan generation.
- `brainstorm-automation-boundaries`: Covers which actions are automatic and hidden vs which require explicit user confirmation.

### Modified Capabilities
- `structured-brainstorming-flow`: Change the host experience from conversation-only flow to a staged workflow that ends in reviewable `spec + plan` outputs.
- `structured-brainstorming-runtime`: Change the runtime from question sequencing only to full workflow execution with hidden internal automation.
- `structured-brainstorming-messages`: Change message/session payload expectations so hosts can render workflow stage, approval prompts, and final `spec + plan` bundles without exposing engineering jargon.

## Impact

- Affects `skills/brainstorming/scripts/codex-runtime-adapter.cjs`, `web-session-manager.cjs`, `server.cjs`, `structured-host.cjs`, and the `/app` shell.
- Likely adds a workflow coordinator, hidden checkpoint abstraction, internal review orchestration, and final artifact-bundle model.
- Requires expanded tests for stage progression, automation boundaries, user review gates, and end-to-end `spec + plan` completion.
