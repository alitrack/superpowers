## 1. Session Orchestration Boundary

- [x] 1.1 Stop the browser app shell from forcing `workflowMode: 'full_skill'` during ordinary session creation while preserving explicit API support for callers that still request full-skill mode
- [x] 1.2 Update session/workflow copy so ordinary browser sessions read as runtime-driven brainstorming rather than a hardcoded spec-plan pipeline
- [x] 1.3 Add regression coverage proving default browser session creation stays out of full-skill mode unless explicitly requested

## 2. Deliverable Fidelity

- [x] 2.1 Update persisted artifact/result markdown generation so conversation-mode exports prefer runtime title, artifact markdown, and deliverable sections over generic brainstorm/spec-plan wrappers
- [x] 2.2 Keep spec/plan bundle generation restricted to explicit full-skill sessions and preserve current full-skill completion behavior
- [x] 2.3 Add regression coverage for a non-software prompt showing that browser exports no longer collapse into a spec/plan bundle by default

## 3. Thin-Shell Mainstage

- [x] 3.1 Keep workflow stage/status in the left rail and reduce mainstage workflow chrome to lightweight graph-level controls
- [x] 3.2 Preserve visible graph continuity when history is collapsed so `topic-root` still connects to the first visible node
- [x] 3.3 Remove or demote remaining mainstage copy that implies the UI is the workflow owner rather than the Codex+skills host

## 4. Verification

- [x] 4.1 Update targeted browser-host tests for session creation, exports, and mainstage graph continuity
- [x] 4.2 Run targeted brainstorm-server tests and rebuild the web graph bundle
- [x] 4.3 Restart the local server and manually verify both default conversation mode and explicit full-skill behavior
