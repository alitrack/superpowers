## 1. Canvas View State

- [x] 1.1 Extend the browser view-state helper so it can derive a canvas workspace model with anchor card, supporting cards, completion cluster, and local focus/overview state.
- [x] 1.2 Define the first-pass supporting card model for recent steps, review drafts, shortlisted directions, and finished artifacts without introducing a second active decision.
- [x] 1.3 Preserve the stable “start a new brainstorm” entry and full-history access inside the derived canvas workspace state.

## 2. Canvas Workspace UI

- [x] 2.1 Rework the browser shell into a brainstorming canvas workspace with a dominant anchor card and spatially distinct supporting card zones.
- [x] 2.2 Add focused and overview workspace modes plus supporting-card inspection behavior without changing backend workflow state.
- [x] 2.3 Render review checkpoints and `artifact_ready` completion as dedicated canvas clusters rather than linear side panels.

## 3. Verification

- [x] 3.1 Add regression tests for the derived canvas workspace state, including anchor dominance, supporting-card limits, and completion-cluster shape.
- [x] 3.2 Update browser/product tests to prove the `/app` shell renders a canvas workspace and preserves the one-active-question rule.
- [x] 3.3 Run targeted brainstorm-server verification plus a browser smoke flow confirming the canvas workspace still completes the full brainstorming path without terminal dependence.
