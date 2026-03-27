## 1. Codex Runtime Adapter Foundation

- [x] 1.1 Add a dedicated Codex runtime adapter boundary plus a fake adapter for deterministic tests.
- [x] 1.2 Implement app-server backend selection and session bootstrap behind the adapter boundary.
- [x] 1.3 Implement `codex exec` fallback with persisted transcript rehydration for later turns.

## 2. Session Manager Integration

- [x] 2.1 Extend persisted web session state to store backend mode, provider session identity, current active message, and normalized answer history.
- [x] 2.2 Replace the hardcoded `structured-demo` `/app` runtime path with provider-backed session creation, load, and answer submission.
- [x] 2.3 Return explicit session creation/continuation failures when no supported Codex backend is available instead of silently falling back to demo flow.

## 3. Structured Contract and Completion Flow

- [x] 3.1 Add runtime-to-contract mapping that converts Codex user-input requests or parser-friendly fallback text into `pick_one`, `pick_many`, `confirm`, or `ask_text` questions.
- [x] 3.2 Map real runtime completion into persisted `summary` and `artifact_ready` outputs while preserving the existing browser contract.
- [x] 3.3 Keep the legacy companion/demo path contract-compatible but isolated from the default `/app` product runtime.

## 4. Verification

- [x] 4.1 Add automated tests for app-server-first backend selection, exec fallback, and persisted backend-mode reuse.
- [x] 4.2 Add headless product tests for session resume, single active question continuity, and “no demo fallback” failure handling.
- [x] 4.3 Run the brainstorm-server verification suite and document any remaining manual smoke checks needed for real Codex backend validation.
