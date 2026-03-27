## 1. Session Runtime Foundation

- [x] 1.1 Replace the singleton demo runtime with a session manager that creates isolated runtime state per brainstorming session.
- [x] 1.2 Add persistent session storage for current message, normalized answer history, and completion state.
- [x] 1.3 Add browser-facing session lifecycle endpoints or channels for create, load, and answer submission.

## 2. Browser-First Web App

- [x] 2.1 Build a browser-first app shell that can create or resume sessions without relying on watched HTML files as the primary product path.
- [x] 2.2 Update the structured brainstorming UI to hide protocol/debug metadata and show product-facing progress/history states.
- [x] 2.3 Support browser-native completion flow for `question`, `summary`, and `artifact_ready` without requiring terminal handoff.

## 3. Artifact Pipeline

- [x] 3.1 Implement real persisted `summary` and `artifact_ready` outputs tied to individual sessions.
- [x] 3.2 Add browser retrieval and display flows for completed summaries and stored artifacts.

## 4. Compatibility and Verification

- [x] 4.1 Decide whether the existing watched-directory companion path remains as a legacy/developer mode and wire the routing/runtime boundary accordingly.
- [x] 4.2 Add end-to-end tests for isolated concurrent sessions, session resume, and browser-only answer flow.
- [x] 4.3 Add end-to-end tests for persisted summary/artifact retrieval and rerun the brainstorm-server verification suite.
