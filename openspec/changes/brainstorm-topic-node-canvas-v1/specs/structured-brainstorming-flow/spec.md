## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time, and the browser host SHALL render that decision as the single active node within a topic-rooted canvas that may also show prior path steps, branch context, convergence nodes, and artifact nodes without turning any of them into competing answerable questions.

#### Scenario: Current active decision is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single decision as the dominant active node within the canvas and highlights its position relative to the root topic and surrounding branch path

#### Scenario: Prior answers exist
- **WHEN** earlier steps have already been completed
- **THEN** the host may show the current path, branch context, and nearby completed nodes by default while keeping the current active node as the only formal answer target

#### Scenario: Full history is requested
- **WHEN** the user explicitly asks to review the full prior thread
- **THEN** the host reveals the broader path and branch structure through the canvas without replacing the single active-node focus unless the session is already complete

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude V1 with a structured completion state that can be rendered as convergence and artifact nodes inside the host canvas while still exposing the reviewable design spec and implementation plan bundle.

#### Scenario: First-phase workflow completes
- **WHEN** the workflow has completed design approval, spec review, user spec review, and plan generation
- **THEN** the backend emits a completion state that the host can present as a convergence result plus the final `spec + plan` bundle and any finished artifact metadata

#### Scenario: Workflow blocks before completion
- **WHEN** the backend cannot complete the internal workflow automatically
- **THEN** the host presents the current reviewable state inside the same canvas together with one active request for user guidance instead of fabricating a local next question
