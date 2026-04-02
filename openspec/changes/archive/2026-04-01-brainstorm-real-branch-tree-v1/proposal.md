## Why

当前 browser brainstorming 虽然已经有 `branchRun` 和树形节点，但本质上仍是假分支：用户从某个 question 选择另一条 option 后，并不会在该 option 上启动一个真正独立、可继续推进的 runtime 分支，只是得到一个本地摘要节点。这会直接破坏“回看某题并沿另一个选项继续跑下去”的核心体验，也让决策树失去作为真实分支工作台的意义。

同时，现有 XYFlow 布局仍然是从左到右的流程图，不符合用户要的“从上到下的决策树”阅读方式。现在需要把分支语义和树布局一起拉正：question 节点冻结不变，任一历史 question 的任一 option 都可以开出新的真实分支会话，并以自上而下的决策树方式展示。

## What Changes

- Add real branch-session support so a historical question node can spawn a new isolated branch from a chosen option and continue through the real runtime instead of ending as a fake local note.
- Preserve each generated question node as a frozen historical snapshot and allow new branches to be created from that frozen question without mutating the original node.
- Keep branch execution isolated from the mainline and sibling branches, while allowing the user to switch the active branch from the tree and continue only that branch.
- Update the browser mainstage and XYFlow layout so the decision graph renders as a top-down tree instead of a left-to-right flow.
- Keep the canvas as the primary branch selector and history surface, so branch creation and branch switching both happen from the tree itself.

## Capabilities

### New Capabilities
- `brainstorm-branch-sessions`: create and continue real isolated branch sessions from historical question-option snapshots inside one brainstorming topic.

### Modified Capabilities
- `structured-brainstorming-flow`: change the flow contract so frozen historical question nodes can spawn additional real branches after the original mainline choice has already been made.
- `brainstorm-mainstage-ui`: change the browser mainstage from a left-to-right mixed flow into a top-down decision-tree workspace where branch selection and continuation are tree-driven.
- `brainstorm-web-session-management`: change session state persistence so branch sessions are stored as real branch contexts instead of lightweight local branch summaries.
- `codex-brainstorm-runtime`: change runtime continuation rules so a branch can resume from a historical question snapshot plus selected option without contaminating the mainline provider session.

## Impact

- Affects [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs), [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs), and possibly [codex-app-server-client.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-app-server-client.cjs) for branch continuation semantics.
- Affects [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs), [web-app-shell.html](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-app-shell.html), and [skills/brainstorming/web-client/src/index.jsx](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/web-client/src/index.jsx) for top-down tree rendering and tree-driven branch actions.
- Requires regression updates in [web-session-manager.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-session-manager.test.js), [web-product.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-product.test.js), and [web-mainstage-state.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-mainstage-state.test.js).
