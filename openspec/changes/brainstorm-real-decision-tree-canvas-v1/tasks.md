## 1. Tree Canvas Model

- [x] 1.1 Replace the current grouped `pathNodes / contextNodes / resultNodes` rendering contract with a tree-canvas view model that encodes parent-path, active-node, sibling-branch, and result-node geometry
- [x] 1.2 Keep the tree canvas derived from existing session/history/workflow/provenance fields with stable fallback behavior for sparse sessions
- [x] 1.3 Preserve the one-active-question rule while embedding the active form state into the active tree node rather than a detached panel

## 2. Primary Canvas Layout

- [x] 2.1 Rework `web-app-shell.html` so the decision tree becomes the primary canvas surface instead of one sibling panel in a three-column dashboard
- [x] 2.2 Move the active question UI into the tree canvas and demote inspector/details to a clearly secondary surface
- [x] 2.3 Keep the “start another topic” entry available only as a secondary dock that cannot retake the mainstage during active or completed sessions

## 3. Async Interaction Feedback

- [x] 3.1 Add visible pending and disabled states for `Artifact Session` and `Summary Session` creation
- [x] 3.2 Add visible pending and disabled states for answering the active question, including slow real-runtime waits
- [x] 3.3 Show visible error recovery when create or submit requests fail instead of leaving the UI looking inert

## 4. Verification

- [x] 4.1 Update `tests/brainstorm-server/web-mainstage-state.test.js` to lock the shape around a true tree canvas instead of grouped panel lists
- [x] 4.2 Update `tests/brainstorm-server/web-product.test.js` to verify the real tree-canvas shell and explicit async feedback states
- [x] 4.3 Run targeted brainstorm-server tests plus a manual browser smoke check to confirm the UI no longer reads as a dashboard and no longer hides slow/failing requests
