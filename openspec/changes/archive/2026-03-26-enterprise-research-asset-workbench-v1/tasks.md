## 1. Research Asset Model and Persistence

- [x] 1.1 Add a dedicated research asset schema/helper module for workspace, bundle, review-request, and audit record normalization.
- [x] 1.2 Add a research asset store that persists workspaces, published bundles, review requests, and audit references under the brainstorming product data directory.
- [x] 1.3 Extend checkpoint persistence so research lifecycle triggers create and list checkpoint records without changing the existing hidden-workflow checkpoint contract.

## 2. Lifecycle Rules and Publication

- [x] 2.1 Extend `web-session-manager.cjs` with research workspace CRUD and root-question / hypothesis tree constraints.
- [x] 2.2 Enforce evidence freeze rules, evidence-to-judgment promotion guards, conclusion readiness checks, and checkpoint creation for lifecycle transitions.
- [x] 2.3 Add publish validation, immutable bundle snapshot generation, version incrementing, superseded/archive behavior, and clone-to-new-workspace reuse flow.

## 3. Governance and Service APIs

- [x] 3.1 Add `/api/assets`, `/api/assets/:id`, publish, review-request, and audit-read endpoints in `server.cjs`.
- [x] 3.2 Enforce the V1 RBAC matrix and human-confirmation gates for evidence verification/acceptance, publish approval, export, and cross-team sharing.
- [x] 3.3 Persist review requests and audit entries with the minimum required fields and expose read paths that keep auditor access read-only.

## 4. Workbench UI and Verification

- [x] 4.1 Update `web-app-shell.html` to show research asset library, publish-review state, read-only published bundle preview, and review request queue without leaking developer-only metadata.
- [x] 4.2 Wire the browser workbench to the new asset and governance APIs while preserving the existing brainstorming session flow.
- [x] 4.3 Add regression tests for research asset APIs, lifecycle guards, governance rules, and workbench rendering, then run the targeted brainstorm-server test suite.
