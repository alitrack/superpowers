## ADDED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a dedicated canvas workspace where the current active decision is rendered as the anchor card and supporting context is arranged as spatially distinct supporting cards.

#### Scenario: In-progress session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still waiting for input
- **THEN** it renders the current active question or approval decision as the anchor card and shows supporting cards around it without introducing a second answerable decision

#### Scenario: Review checkpoint is shown in the canvas workspace
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the workspace keeps the approval decision as the anchor card and shows the current draft as a supporting read-only card

### Requirement: The browser SHALL support focused and overview canvas modes
The browser brainstorming product SHALL let the user switch between a focused canvas mode that emphasizes the current active decision and an overview mode that exposes more of the current session structure without changing backend workflow state.

#### Scenario: Focused mode is active
- **WHEN** the workspace first loads an active session
- **THEN** it defaults to focused mode where the anchor card is visually dominant and only a limited set of supporting cards are emphasized

#### Scenario: User switches to overview mode
- **WHEN** the user requests a broader workspace view
- **THEN** the browser reveals a more complete set of supporting cards while preserving the same single active decision and session workflow state

### Requirement: Supporting canvas cards SHALL remain inspectable without becoming new active questions
The browser brainstorming product SHALL allow users to inspect supporting cards such as prior steps, shortlisted directions, review drafts, and completion artifacts without turning them into concurrent answerable decisions.

#### Scenario: User inspects a supporting card
- **WHEN** the user selects a supporting canvas card
- **THEN** the browser shows its details in a supporting inspection surface while keeping the anchor card as the only active input target

#### Scenario: User requests deeper history from the canvas
- **WHEN** the current session contains more supporting steps than the default workspace shows
- **THEN** the browser reveals the additional prior steps through the canvas workspace without replacing the anchor card during an in-progress session
