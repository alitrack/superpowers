## 1. Seed-First Session Entry

- [x] 1.1 Add a seed-entry state to the browser app so the page no longer auto-creates an empty session on first load.
- [x] 1.2 Update the browser session creation call and `/api/sessions` handler to accept an `initialPrompt` for new sessions.
- [x] 1.3 Persist the session seed in the session manager so reload and resume keep the original brainstorming topic.

## 2. Runtime Initialization

- [x] 2.1 Add a seeded-session initialization helper in the runtime adapter that converts the initial prompt into strategy state and first-turn context.
- [x] 2.2 Update app-server session creation so seeded sessions skip the generic intake question and start from the first real brainstorming move.
- [x] 2.3 Update exec fallback session creation so seeded sessions use the same phase-aware starting point as app-server sessions.
- [x] 2.4 Preserve the existing unseeded compatibility fallback for non-browser callers.

## 3. Product Behavior and Verification

- [x] 3.1 Add browser/API regression tests covering seed-first creation, no-auto-empty-session behavior, and persisted seed context.
- [x] 3.2 Add quality checks that the first formal question after seed entry is not another “what do you want to brainstorm?” intake question.
- [x] 3.3 Run the brainstorm-server verification suite plus a real smoke flow, then document the accepted seed-first behavior and quality bar.
