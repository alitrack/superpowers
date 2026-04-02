## 1. Runtime Hardening

- [x] 1.1 Add bounded timeout handling to browser session creation and align create fallback behavior with submit fallback behavior for `full_skill` sessions.
- [x] 1.2 Tighten answer-submission timeout, fallback, and recoverable error reporting so second-question submits cannot hang silently.
- [x] 1.3 Extend runtime/session-manager regression coverage for create stall, submit stall, and fallback provenance behavior.

## 2. Graph Client Foundation

- [x] 2.1 Introduce a minimal bundled browser graph client with `react`, `react-dom`, `@xyflow/react`, and deterministic layout support.
- [x] 2.2 Convert `web-mainstage.cjs` into a graph-state adapter that emits xyflow nodes, edges, focus metadata, and completion cluster relationships.
- [x] 2.3 Wire the existing shell to mount the graph client without changing the current session and artifact APIs.

## 3. Custom Node Canvas

- [x] 3.1 Implement custom node components for topic, path step, active question, branch direction, convergence, and artifact states.
- [x] 3.2 Embed the structured-host answer UI inside the active-question node while keeping all non-active nodes inspectable only.
- [x] 3.3 Render visible edges and deterministic layout so topic, path, branches, convergence, and artifact relationships are immediately legible as a decision tree.

## 4. Completion and Secondary Surfaces

- [x] 4.1 Replace the inspector-only finished-result presentation with a graph-native convergence-and-artifact completion cluster.
- [x] 4.2 Keep supporting package details, export actions, and session navigation as secondary surfaces that do not replace graph focus.
- [x] 4.3 Ensure reloading a completed or in-progress session restores the correct graph focus node instead of collapsing back to a generic page state.

## 5. Verification

- [x] 5.1 Add product-level regression coverage for the second-question submit path and for the new xyflow canvas shell markers.
- [x] 5.2 Run the brainstorm-server suite and a manual `/app` smoke check covering create timeout/fallback, active-node answering, and convergence/artifact graph rendering.
