## 1. Branch Session Model

- [x] 1.1 Replace lightweight local `branchRun` summaries with real branch session state that can carry its own runtime/provider snapshot, history, current message, completion state, and status
- [x] 1.2 Add compatibility loading so older persisted branch summary data can still be read without crashing while new branches use the real branch session model
- [x] 1.3 Persist frozen question-anchor metadata needed to reopen new branches from any historical question node and selected option

## 2. Real Branch Continuation

- [x] 2.1 Add a tree-driven action that starts a new branch from a historical question snapshot plus selected option instead of only materializing placeholder branch notes
- [x] 2.2 Implement real runtime continuation for an active branch session so answering inside a branch yields the next runtime `question`, `summary`, or `artifact_ready`
- [x] 2.3 Keep mainline and sibling branches isolated when one branch advances, completes, or is reopened after reload

## 3. Top-Down Decision Tree UI

- [x] 3.1 Update mainstage graph derivation so branch nodes are represented as true child paths of frozen question anchors rather than synthetic side notes
- [x] 3.2 Change the XYFlow dagre layout and handle positions from left-to-right flow to top-down decision tree
- [x] 3.3 Keep tree selection as the only way to switch the active branch context, with the main input area scoped to the selected branch or mainline

## 4. Verification

- [x] 4.1 Add regression coverage for starting multiple branches from one historical question, continuing a branch through real runtime, and preserving sibling isolation
- [x] 4.2 Add UI/state tests for top-down tree layout and branch-driven active context switching
- [x] 4.3 Run targeted brainstorm-server tests, rebuild the graph bundle, restart the local server, and manually verify real branching in the browser
