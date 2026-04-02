## 1. Topic-Rooted Session Entry

- [x] 1.1 Remove competing browser start surfaces so a new brainstorming session begins from one explicit topic-entry affordance.
- [x] 1.2 Ensure session creation, reload, and resume keep `seedPrompt` as the visible root topic context of the canvas.
- [x] 1.3 Update empty and resume states so the browser reopens around the root topic plus the latest unresolved or completed focus node instead of a generic dashboard view.

## 2. Derived Node Graph State

- [x] 2.1 Refactor `web-mainstage.cjs` to derive normalized node kinds for topic, completed path, active step, branch context, convergence, and artifact results from existing session data.
- [x] 2.2 Enforce a single answerable active node in the derived state while keeping non-active nodes inspectable and action-constrained by node kind.
- [x] 2.3 Map `summary` and `artifact_ready` session states into convergence/artifact node data with inspector-ready metadata and source context.

## 3. Canvas-First Mainstage UI

- [x] 3.1 Replace the detached central question layout in `web-app-shell.html` with active-node controls embedded directly inside the primary canvas.
- [x] 3.2 Render topic, path, branch, convergence, and artifact nodes in one mainstage composition while keeping inspector/details secondary.
- [x] 3.3 Present node labels and node-level actions in user-facing language without exposing protocol/debug fields in the product UI.

## 4. Completion and Navigation Behavior

- [x] 4.1 Render completed sessions as a convergence-and-artifact cluster that stays anchored to the same canvas as the explored path.
- [x] 4.2 Wire artifact preview/export affordances through the artifact node and inspector using persisted session artifact metadata.
- [x] 4.3 Keep “start another topic” and session navigation secondary while restoring the correct active or completed canvas focus when reopening a session.

## 5. Verification

- [x] 5.1 Update brainstorm-server state and product tests to lock the topic-rooted canvas model and completion-node behavior.
- [x] 5.2 Run the targeted brainstorm-server suite and a manual `/app` smoke check covering topic entry, single active node, and completed-session canvas rendering.
