## 1. Restore the V1 Workbench Baseline

- [x] 1.1 Remove the current uncommitted research-canvas experiment from `web-app-shell.html` and restore the panel-based V1 skeleton layout.
- [x] 1.2 Remove any temporary test assertions that only validate the local canvas experiment instead of the archived V1 skeleton behavior.

## 2. Close the ReviewRequest Workflow Gap

- [x] 2.1 Extend the research asset model/store to persist review-request resolution fields and allow updating an existing request status.
- [x] 2.2 Add `web-session-manager.cjs` helpers and `server.cjs` endpoints to resolve or reject review requests with authorization checks and preserved history.
- [x] 2.3 Add governance regression tests that cover resolving and rejecting review requests through the service layer.

## 3. Close the Hypothesis Lifecycle Gap

- [x] 3.1 Add explicit `parkHypothesis` and `supersedeHypothesis` lifecycle helpers in `web-session-manager.cjs` with preserved branch history and minimal reason metadata.
- [x] 3.2 Record `hypothesis_parked_or_superseded` checkpoints and expose minimal API routes for those lifecycle transitions.
- [x] 3.3 Add lifecycle regression tests that prove parked and superseded hypotheses remain in history and create the required checkpoint records.

## 4. Make Governance Visible in the Browser

- [x] 4.1 Replace the hardcoded `Owner` request headers in `web-app-shell.html` with a lightweight role switcher for `Owner`, `Editor`, `Viewer`, and `Auditor`.
- [x] 4.2 Ensure the workbench uses the selected role for API requests and keeps forbidden write actions hidden or read-only in the browser UI.
- [x] 4.3 Run `npm --prefix tests/brainstorm-server test` and `openspec validate "research-workbench-v1-gap-closure" --type change --strict`.
