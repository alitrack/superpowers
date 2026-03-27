## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming in a backend-side workflow runtime that owns both active user decisions and hidden internal automation through plan completion.

#### Scenario: Session starts
- **WHEN** a structured brainstorming browser session is initialized
- **THEN** the backend runtime initializes the full workflow state and emits the first user-facing decision required for that workflow

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime decides whether to emit the next `question`, run a hidden workflow step, surface a review checkpoint, or emit the final `spec + plan` completion state

### Requirement: Browser structured host behaves as a renderer-only client
The browser structured brainstorming host MUST render backend-provided workflow messages and submit normalized answers without embedding its own workflow tree.

#### Scenario: Host receives a question or review checkpoint
- **WHEN** the browser host receives a backend-provided user-facing decision
- **THEN** it renders that decision as the single active answerable prompt and does not derive an alternate next step locally

#### Scenario: Host submits an answer
- **WHEN** the browser host accepts the user's submission
- **THEN** it emits a normalized `answer` payload and waits for the next backend message or stage update before presenting another active decision

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST exercise the same transport contract used by future structured brainstorming hosts even as the workflow expands beyond question sequencing into full skill orchestration.

#### Scenario: Demo workflow advances
- **WHEN** the local runtime processes a browser-submitted `answer`
- **THEN** the next outbound message and stage metadata still conform to the shared structured brainstorming contract

#### Scenario: Browser demo is loaded
- **WHEN** the structured browser product initializes
- **THEN** it can render workflow-stage transitions and final artifact bundles without embedding the full branching or automation policy in page-local markup
