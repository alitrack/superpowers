## 1. Semantic Model

- [x] 1.1 Define the browser canvas node taxonomy and graph contract so `topic`, `decision`, `option`, `branch-run`, and `result` are distinct node kinds with stable meanings.
- [x] 1.2 Extend session/runtime state to distinguish current-question options, shortlisted directions, selected path, and materialized branch runs instead of collapsing them into one branch concept.
- [x] 1.3 Mark which questions are branchable and what branch-materialization action text and payload they expose.

## 2. Runtime Branch-Run Foundation

- [x] 2.1 Extend the brainstorming runtime/session manager so one brainstorming session can persist `branch-runs` with parent decision, source option, status, history, current message, and result summary.
- [x] 2.2 Implement explicit branch materialization for branchable multi-select decisions so shortlisted options only become branch runs after a dedicated user action.
- [x] 2.3 Add deterministic branch selection and reload behavior so reopening a session restores the selected branch context rather than collapsing back to a generic mainline state.

## 3. Mainstage and Canvas Behavior

- [x] 3.1 Replace the current “options rendered as branch nodes” behavior with distinct `decision`, `option`, and `branch-run` node rendering in the graph adapter and UI shell.
- [x] 3.2 Bind the primary answer surface to exactly one active context at a time: the mainline active decision or the currently selected branch run.
- [x] 3.3 Make tree selection switch the active branch context while keeping non-selected branches inspectable only.
- [x] 3.4 Update focused and overview modes so they reflect decision context and branch state, not just whole-graph zoom.

## 4. Verification

- [x] 4.1 Add state-level regression coverage proving that current-question options no longer masquerade as branch runs before materialization.
- [x] 4.2 Add regression coverage for explicit branch materialization, branch selection, reload restore, and returning from a branch run to the mainline context.
- [x] 4.3 Run the brainstorm-server browser/product smoke flow covering: start topic, shortlist multiple directions, materialize branches, switch branches from the tree, continue one branch, and preserve the other branches.
