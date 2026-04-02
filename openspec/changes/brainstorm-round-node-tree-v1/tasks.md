## 1. Round Graph Model

- [x] 1.1 Define the persisted round-graph contract for brainstorming sessions, including `topic`, `round`, `result`, `parentRoundId`, `activeRoundId`, and source-answer metadata.
- [x] 1.2 Add lazy migration from the current session shape (`seedPrompt`, `history`, `currentMessage`, `branchRuns`) into the new round-graph model so older sessions still load.
- [x] 1.3 Update runtime/session persistence so linear answers append the next round on the same trunk and explicit forks persist child round lineages with recoverable status.

## 2. Sequencing and Context Switching

- [x] 2.1 Change normal answer submission so the next backend question becomes the next visible round node instead of relying on persistent option nodes.
- [x] 2.2 Change explicit branch materialization so each selected direction creates a child round node representing that branch’s next question/state, not an option-shaped branch placeholder.
- [x] 2.3 Restore tree selection and reload behavior from `activeRoundId` so the browser reopens the same active round context on refresh.

## 3. Canvas and Mainstage

- [x] 3.1 Remove persistent option nodes from the graph adapter and render only `topic`, `round`, and `result` nodes on the main canvas.
- [x] 3.2 Keep options and submit controls inside the current active round node while moving chosen-answer context to edge labels, chips, or inspector metadata.
- [x] 3.3 Rework focused and overview modes around trunk-first round lineage plus explicit branch subtrees instead of the current option-heavy graph.

## 4. Verification

- [x] 4.1 Add state-level regression coverage for linear progression: `node0 -> node1 -> node2 -> node3`, with no persistent option nodes on the canvas.
- [x] 4.2 Add regression coverage for explicit fork semantics: one parent round, multiple child branch rounds, one active round at a time, and stable reload restore.
- [x] 4.3 Run a browser/product smoke flow covering: start topic, render `node1`, answer into `node2`, answer into `node3`, explicitly fork from a round, and verify the child branch nodes represent next-round states rather than option cards.
