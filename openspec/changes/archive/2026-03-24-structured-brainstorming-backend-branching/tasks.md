## 1. Backend Runtime

- [x] 1.1 Add a backend-side structured brainstorming session runtime that owns the active question id, answer history, and next-message generation.
- [x] 1.2 Seed the browser demo from backend-owned initial state instead of a page-local branching tree.

## 2. Browser Host Boundary

- [x] 2.1 Update the structured demo so it renders backend-provided `question` messages and only submits normalized `answer` payloads.
- [x] 2.2 Remove the browser demo's responsibility for deciding the next question or synthesizing `summary` / `artifact_ready` locally.

## 3. Verification

- [x] 3.1 Add or update tests covering backend-owned initial question bootstrap and answer-driven runtime transitions.
- [x] 3.2 Re-run the brainstorm server and structured-host verification suite after the runtime wiring is in place.
