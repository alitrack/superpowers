## 1. Result Snapshot And Export API

- [x] 1.1 Add a normalized finished-result snapshot builder in `web-session-manager.cjs` that derives hero content, deliverable sections, supporting artifacts, and export paths from completed sessions.
- [x] 1.2 Persist or generate markdown/json finished-result exports and add session-manager/server read paths for `/api/sessions/:id/result` and `/api/sessions/:id/result.md`.
- [x] 1.3 Ensure full-skill completion `artifact_ready` payloads include the normalized finished deliverable plus supporting generated-artifact metadata.

## 2. Completion Surface Rework

- [x] 2.1 Update `web-mainstage.cjs` so completion mode derives an outcome-first result surface from the normalized finished-result snapshot instead of a bundle-first cluster.
- [x] 2.2 Update `web-app-shell.html` so completed sessions show recommendation/section cards, export actions, and a supporting package area while keeping the new-brainstorm entry visible.

## 3. Verification

- [x] 3.1 Add or update tests for session-manager and server result export behavior.
- [x] 3.2 Add or update UI/mainstage tests for the finished-result surface and supporting package layout.
- [x] 3.3 Run `npm --prefix tests/brainstorm-server test` and `openspec validate brainstorm-deliverable-surface-v1 --type change --strict`.
