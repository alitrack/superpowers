## MODIFIED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a decision-tree-first canvas where the visible branch structure occupies the primary visual surface, and the current active decision is rendered as an active node within that tree rather than as a sibling panel beside it.

#### Scenario: In-progress session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still waiting for input
- **THEN** it renders the current active question or approval decision as an active node on the primary tree canvas and shows the surrounding branch path in the same canvas without introducing a second answerable decision

#### Scenario: Review checkpoint is shown in the canvas workspace
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the canvas keeps the approval decision as the active tree node while showing the current draft and prior path as secondary context attached to that same tree view

### Requirement: The browser SHALL support focused and overview canvas modes
The browser brainstorming product SHALL let the user switch between a focused tree-canvas mode that emphasizes the current active node and a broader overview mode that exposes more of the same branch structure without changing backend workflow state.

#### Scenario: Focused mode is active
- **WHEN** the workspace first loads an active session
- **THEN** it defaults to focused mode where the active node and its immediate tree context are emphasized without collapsing the fact that the surface is still a tree

#### Scenario: User switches to overview mode
- **WHEN** the user requests a broader workspace view
- **THEN** the browser reveals a fuller branch path, more sibling directions, and completion nodes while preserving the same single active decision and session workflow state

### Requirement: The decision tree SHALL show explicit branch relationships rather than grouped node lists
The browser brainstorming product SHALL visualize parent-child path, sibling directions, and terminal result nodes as explicit tree relationships instead of merely grouping them into separate lists such as path, directions, or result buckets.

#### Scenario: Current path is visible
- **WHEN** the session already contains one or more completed answers before the active node
- **THEN** the user can visually distinguish the parent path that leads into the active node rather than only reading those nodes as a flat category list

#### Scenario: Adjacent directions are visible
- **WHEN** the session includes sibling directions or nearby alternative paths
- **THEN** the user can visually recognize them as branches adjacent to the active node rather than as unrelated support cards or isolated lists

### Requirement: The decision tree SHALL be derived from existing session state without a new persistent tree schema
The browser brainstorming product SHALL derive its visible decision-tree canvas from existing session data such as `currentMessage`, `history`, `workflow`, and available provenance fields, and V1 MUST fall back gracefully when some of those fields are sparse instead of introducing a new persistent tree or layout schema.

#### Scenario: Sparse session state is loaded
- **WHEN** the browser opens a session that has only the active message and limited prior history
- **THEN** the canvas still renders a minimal topic-plus-active-node tree without requiring additional persisted tree data

#### Scenario: Richer session state is loaded
- **WHEN** the session also includes history, checkpoints, or provenance-derived adjacent context
- **THEN** the canvas expands the visible tree from those existing fields without inventing a separate V1 tree persistence model
