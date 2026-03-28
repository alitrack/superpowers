# brainstorm-mainstage-ui Specification

## Purpose
Define how the browser brainstorming workspace keeps the current active decision dominant while presenting history, review checkpoints, and finished results with clear visual hierarchy.
## Requirements
### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active question or approval decision the dominant visual focus of the canvas workspace mainstage instead of giving equal weight to surrounding cards or panels.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the anchor position in the canvas workspace and surrounding supporting cards do not compete with it visually

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown as a supporting read-only card in the canvas workspace while the single active approval decision remains the primary focus

### Requirement: The browser mainstage SHALL show only lightweight recent context by default
The browser brainstorming product SHALL show only the most recent `2-3` completed steps as lightweight supporting cards by default, while allowing the user to expand into broader session history on demand.

#### Scenario: Prior steps exist
- **WHEN** the current session already contains multiple completed steps
- **THEN** the default workspace shows only the recent `2-3` steps as lightweight supporting cards near the anchor card

#### Scenario: User wants deeper history
- **WHEN** the user explicitly requests more context
- **THEN** the product reveals fuller session history through the canvas workspace without replacing the mainstage focus on the current active decision

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present the finished session as an outcome-first completion surface where the mature brainstorming deliverable is the primary visible cluster, while the generated `spec + plan` package remains supporting context rather than the only visible completion object.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the workspace switches to a dedicated result presentation where the recommendation and finished deliverable sections are the main visible cluster

#### Scenario: Supporting package is still available after completion
- **WHEN** the user views a completed session
- **THEN** the design spec, implementation plan, and result bundle remain visible as supporting package cards without replacing the finished-result surface as the primary focus

#### Scenario: User starts another brainstorm after completion
- **WHEN** the user wants to begin a new brainstorm while viewing a completed session
- **THEN** the fresh-topic entry path remains clearly available inside the workspace without hiding or overwriting the completed result by default
