# brainstorm-canvas-workspace-ui Specification

## Purpose
TBD - created by archiving change brainstorm-canvas-workspace-v1. Update Purpose after archive.
## Requirements
### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a dedicated decision-tree workbench where `node0` is the seed topic, each formal backend question or checkpoint is rendered as one round node on the visible tree, and explicit branch subtrees appear only after the user triggers a fork action, instead of keeping current option cards as persistent graph peers.

#### Scenario: Linear session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still moving through one mainline path without an explicit fork
- **THEN** it renders a single trunk of round nodes such as `topic -> round1 -> round2 -> active round`, and the current options stay inside the active round node rather than appearing as sibling graph nodes

#### Scenario: Explicit fork creates visible branch subtrees
- **WHEN** the user explicitly expands multiple shortlisted directions into branches from a round node
- **THEN** the canvas renders child round nodes beneath that parent round, one per materialized branch, and each child represents the next branch question or branch state rather than the raw selected option card alone

### Requirement: The browser SHALL support focused and overview canvas modes
The browser brainstorming product SHALL let the user switch between a focused workbench mode that emphasizes the current active node and a broader overview mode that exposes more of the same decision-tree structure without changing backend workflow state.

#### Scenario: Focused mode is active
- **WHEN** the workspace first loads an active session
- **THEN** it defaults to focused mode where the active node is visually dominant and only the current path plus nearby branch context are emphasized

#### Scenario: User switches to overview mode
- **WHEN** the user requests a broader workspace view
- **THEN** the browser reveals a fuller decision-tree path, checkpoint context, and completion nodes while preserving the same single active decision and session workflow state

### Requirement: Supporting canvas cards SHALL remain inspectable without becoming new active questions
The browser brainstorming product SHALL allow users to inspect non-active tree nodes and supporting workbench panels such as prior steps, shortlisted directions, review drafts, and completion artifacts without turning them into concurrent answerable decisions.

#### Scenario: User inspects a supporting node
- **WHEN** the user selects a non-active node or supporting workspace panel
- **THEN** the browser shows its details in a contextual inspection surface while keeping the active node as the only input target

#### Scenario: User requests deeper history from the canvas
- **WHEN** the current session contains more branch history than the default workspace shows
- **THEN** the browser reveals the additional prior path and checkpoint context through the workbench without replacing the active node during an in-progress session

### Requirement: The decision tree SHALL be derived from existing session state without a new persistent tree schema
The browser brainstorming product SHALL derive its visible decision-tree workbench from existing session data such as `currentMessage`, `history`, `workflow`, and available provenance fields, and V1 MUST fall back gracefully when some of those fields are sparse instead of introducing a new persistent tree or layout schema.

#### Scenario: Sparse session state is loaded
- **WHEN** the browser opens a session that has only the active message and limited prior history
- **THEN** the workbench still renders a minimal topic-plus-active-node tree without requiring additional persisted tree data

#### Scenario: Richer session state is loaded
- **WHEN** the session also includes history, checkpoints, or provenance-derived adjacent context
- **THEN** the workbench expands the visible tree from those existing fields without inventing a separate V1 tree persistence model

