# brainstorm-mainstage-ui Specification

## Purpose
Define how the browser brainstorming workspace keeps the current active decision dominant while presenting history, review checkpoints, and finished results with clear visual hierarchy.
## Requirements
### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL keep the current active branch or mainline question as the dominant focus of the workbench mainstage, while the surrounding tree remains the navigation surface for understanding and switching between real branch paths.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the primary workbench stage while the surrounding tree and context panels remain visually secondary

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a contextual workbench panel while the single active approval decision remains the primary focus

#### Scenario: Mainline question is active
- **WHEN** the user is working on the current mainline question
- **THEN** the mainline node is the active focus and branch nodes remain secondary tree context

#### Scenario: Branch question is active
- **WHEN** the user selects a branch that has its own current question
- **THEN** that branch node becomes the active focus and the mainline becomes secondary context without losing visibility

### Requirement: The browser mainstage SHALL show only lightweight recent context by default
The browser brainstorming product SHALL show only the current branch path, the most recent `2-3` supporting nodes, and the current workflow stage by default, while allowing the user to expand into broader session history on demand.

#### Scenario: Prior steps exist
- **WHEN** the current session already contains multiple completed steps
- **THEN** the default workbench shows the current path and only lightweight nearby context instead of expanding the full branch history automatically

#### Scenario: User wants deeper history
- **WHEN** the user explicitly requests more context
- **THEN** the product reveals fuller session history and branch structure through the workbench without replacing the mainstage focus on the current active node

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present the finished session inside the same workbench as an outcome-first result surface where the mature brainstorming deliverable stays primary, while the branch path and supporting package remain visible as secondary context.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the workbench switches its active stage into a finished-result presentation while keeping the tree path and workspace context visible

#### Scenario: Supporting package is still available after completion
- **WHEN** the user views a completed session
- **THEN** the design spec, implementation plan, and result bundle remain visible as supporting workbench context without replacing the finished-result surface as the primary focus

#### Scenario: User starts another brainstorm after completion
- **WHEN** the user wants to begin a new brainstorm while viewing a completed session
- **THEN** the fresh-topic entry path remains clearly available as a secondary workspace action without hiding or overwriting the completed result by default

### Requirement: The browser mainstage SHALL keep the new-session entry secondary while a session is active
The browser brainstorming product SHALL keep the entry for starting another brainstorm available inside the workbench, but it MUST remain visually secondary to the active session and MUST NOT reclaim the mainstage while an in-progress or completed session is being viewed.

#### Scenario: In-progress session is active
- **WHEN** the user is viewing or answering the current active node
- **THEN** the new-session entry appears as a secondary workspace action rather than a hero surface that competes with the active stage

#### Scenario: Completed session is active
- **WHEN** the user is reviewing a finished result inside the workbench
- **THEN** the new-session entry remains available for starting another topic without replacing the finished-result surface as the dominant content

### Requirement: The browser mainstage SHALL render the graph as a top-down decision tree
The browser brainstorming product SHALL render the decision graph as a top-down tree instead of a left-to-right flow, so users can read the topic root, descending mainline, and lateral branch alternatives in decision-tree form.

#### Scenario: Mainline path is rendered
- **WHEN** the workbench shows the topic root and current mainline path
- **THEN** the graph lays those nodes from top to bottom

#### Scenario: Multiple branches exist below one question
- **WHEN** a frozen question node has multiple child branches
- **THEN** those branch nodes render below that question as sibling children in the same tree layer

#### Scenario: User switches between focused and overview modes
- **WHEN** the user changes graph density mode
- **THEN** the graph keeps the same top-down tree direction and only adjusts spacing or visible context density
