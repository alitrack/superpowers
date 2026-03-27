## ADDED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active question or approval decision the dominant visual focus of the mainstage instead of giving equal weight to surrounding panels.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the primary mainstage area and secondary panels do not compete with it visually

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown as supporting read-only context while the single active approval decision remains the primary focus

### Requirement: The browser mainstage SHALL show only lightweight recent context by default
The browser brainstorming product SHALL show only the most recent `2-3` completed steps as lightweight context by default, while allowing the user to expand full history on demand.

#### Scenario: Prior steps exist
- **WHEN** the current session already contains multiple completed steps
- **THEN** the default mainstage shows only the recent `2-3` steps in a lightweight context rail or equivalent supporting surface

#### Scenario: User wants deeper history
- **WHEN** the user explicitly requests more context
- **THEN** the product reveals the full session history without replacing the mainstage focus on the current active decision

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present the finished `spec + plan` bundle in a dedicated completion mode instead of treating it as one more side panel.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a final `spec + plan` bundle
- **THEN** the mainstage switches to a dedicated result presentation where the finished bundle is the primary view

#### Scenario: User starts another brainstorm after completion
- **WHEN** the user wants to begin a new brainstorm while viewing a completed session
- **THEN** the fresh-topic entry path remains clearly available without hiding or overwriting the completed bundle by default
