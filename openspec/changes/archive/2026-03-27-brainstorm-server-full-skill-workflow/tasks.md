## 1. Workflow Model

- [x] 1.1 Define the full-skill workflow stage model, including visible user stages, hidden internal stages, and blocked/resume states.
- [x] 1.2 Map the `brainstorming` skill checklist to browser-executed workflow checkpoints, including optional visual-assist consent and required approval gates.
- [x] 1.3 Add an automation-boundary policy that distinguishes hidden automatic actions from actions that require explicit user confirmation.

## 2. Runtime Orchestration

- [x] 2.1 Extend the runtime adapter to continue past design approval into design-doc writing, spec review looping, user spec review, and `writing-plans` completion.
- [x] 2.2 Implement hidden internal review orchestration with retry budget, blocked-state surfacing, and resumable workflow state.
- [x] 2.3 Add a checkpoint abstraction that can use git-backed local snapshots when safe and non-git fallbacks otherwise, without exposing git concepts to the default UI.

## 3. Session and Host Experience

- [x] 3.1 Persist workflow stage metadata, approval checkpoints, generated draft artifacts, and final `spec + plan` bundle data in session state and APIs.
- [x] 3.2 Update the browser host to show outcome-first workflow stages, a single active decision, and review surfaces for design/spec/plan checkpoints.
- [x] 3.3 Keep provenance, reviewer mechanics, subagent activity, and checkpoint details in developer-facing inspection only, not in the default user-facing flow.

## 4. Acceptance and Verification

- [x] 4.1 Add acceptance fixtures and regression tests for full 9-step workflow progression through final `spec + plan` completion.
- [x] 4.2 Add tests for automation-boundary rules, including hidden internal actions, non-technical user prompts, and confirmation gates for external side effects or output-type changes.
- [x] 4.3 Run targeted verification and an end-to-end browser smoke flow, then record evidence that a non-CLI user can reach a reviewable `spec + plan` bundle without interacting with engineering concepts.
