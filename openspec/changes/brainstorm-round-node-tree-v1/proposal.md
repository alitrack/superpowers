## Why

当前 `/app` 的树虽然已经区分了 `option` 和 `branch-run`，但它仍然没有遵守用户真实理解的头脑风暴顺序：用户抛出一个问题后，树上应该先出现 `node1 = Q1`，回答后再出现 `node2 = Q2`，而不是把当前选项和未来分支一起挂成一堆线。现在的画布仍然把“候选答案”“下一轮问题”“显式分支”混在一起，导致树看起来像图，但读不出实际推进路径。

## What Changes

- Replace the current option-heavy canvas with a trunk-first round-node tree where `node0` is the user seed topic and each subsequent formal backend question becomes the next visible round node.
- Remove persistent option nodes from the main graph; options remain embedded inside the current active round node as answer controls, and the chosen answer is shown as edge or inspector metadata rather than as a peer node.
- Make explicit fork the only way a branch subtree appears; each child branch node represents the next round in that branch, not the raw option card that triggered it.
- Persist enough round-lineage and fork metadata so reload restores the same visible tree and active round context instead of re-deriving an ambiguous graph from transient UI state.
- Update focused/overview behavior, inspection, and regression tests to reflect round progression semantics rather than “all current options are visible graph leaves.”

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `brainstorm-canvas-workspace-ui`: Change the canvas contract so round nodes, not option nodes, are the primary visible tree units.
- `brainstorm-mainstage-ui`: Change the mainstage focus model so exactly one active round node owns the answer surface while prior rounds and sibling branches remain contextual.
- `brainstorm-web-ui`: Change browser behavior so answering a question creates or activates the next round node in the same workspace, and explicit fork creates child round nodes.
- `codex-brainstorm-runtime`: Add persisted round-lineage and explicit fork state so the browser can restore the same trunk/branch tree after reload.
- `structured-brainstorming-flow`: Change host-facing flow semantics so one formal question maps to one round node, and options are controls within that node rather than standalone tree peers.

## Impact

- Substantially affects `skills/brainstorming/scripts/web-mainstage.cjs`, which currently renders current options and materialized branches as sibling graph structures under the same decision source.
- Affects `skills/brainstorming/scripts/web-session-manager.cjs` and `skills/brainstorming/scripts/codex-runtime-adapter.cjs` because session state must persist round lineage, source-answer metadata, and explicit fork relationships.
- Affects `skills/brainstorming/scripts/web-app-shell.html`, `skills/brainstorming/scripts/structured-host.cjs`, and `skills/brainstorming/web-client/src/index.jsx` because the active answer surface and graph rendering must follow the new round-node semantics.
- Requires updated regression coverage so the product can no longer regress into “options drawn as tree nodes” or “branches drawn before a real child round exists.”
