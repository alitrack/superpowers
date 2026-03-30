## 1. Workbench View Model

- [x] 1.1 Replace the current supporting-card-first `buildCanvasWorkspace()` output with a branch-first workbench view model in `web-mainstage.cjs`
- [x] 1.2 Derive explicit decision-tree, stage, and context-panel data from existing session/history/workflow fields with stable fallback behavior for older sessions
- [x] 1.3 Keep question, review, summary, and completion states mapped onto the same workbench skeleton without introducing a second active answerable node

## 2. Browser Workbench Shell

- [x] 2.1 Rework `web-app-shell.html` from the current anchor-card/detail-page layout into a decision-tree workbench with distinct tree, active-stage, and context regions
- [x] 2.2 Demote “new brainstorm” to a secondary workspace action and remove the current hero-like competition with the active session
- [x] 2.3 Update workbench rendering logic so focused/overview mode changes tree density and context density instead of only showing more supporting cards

## 3. Workbench Interaction Behavior

- [x] 3.1 Add browser interactions for selecting non-active nodes, inspecting their details, and keeping the active node as the only input target
- [x] 3.2 Surface user-facing workflow stage and checkpoint context inside the workbench without exposing protocol/debug jargon
- [x] 3.3 Keep finished-result, supporting package, and export actions visible inside the same workbench when a session reaches summary or artifact-ready completion

## 4. Verification

- [x] 4.1 Update `tests/brainstorm-server/` coverage for decision-tree visibility, active-node dominance, and completion-in-workbench behavior
- [x] 4.2 Run the targeted brainstorm-server test suite and fix regressions introduced by the new workbench model
- [x] 4.3 Run a manual browser smoke check against the local server to confirm the workbench opens and progresses without falling back to the old demo-shell structure
