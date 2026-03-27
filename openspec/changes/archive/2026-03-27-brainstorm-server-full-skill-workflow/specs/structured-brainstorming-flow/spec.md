## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time while still allowing the host to show read-only workflow progress, prior answers, and reviewable draft artifacts around that decision.

#### Scenario: Session begins
- **WHEN** a structured brainstorming session starts after the initial user request
- **THEN** the host renders one formal question or approval prompt and does not render a second unanswered user decision concurrently

#### Scenario: Draft review is active
- **WHEN** the workflow reaches a design-review or spec-review checkpoint
- **THEN** the host may show the current draft as read-only context while keeping only one active approval decision available for input

### Requirement: Backend controls question sequencing and branching
The system SHALL let the backend decide which user-facing question, hidden automation step, review checkpoint, or completion state comes next so workflow behavior stays consistent across hosts and is not hardcoded into individual renderers.

#### Scenario: Answer is submitted
- **WHEN** the host sends a normalized `answer` message
- **THEN** the backend decides whether to emit the next `question`, enter hidden workflow automation, emit a review checkpoint, or emit the final completion bundle

#### Scenario: Multiple hosts implement the same flow
- **WHEN** browser and terminal hosts use the same backend
- **THEN** they follow the same workflow path for the same sequence of normalized answers and approvals

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer, approval surface, and artifact viewer rather than a workflow engine.

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message or workflow-state update instead of deciding the next step locally

#### Scenario: Hidden workflow step is running
- **WHEN** the backend enters an internal automation step such as draft writing or review
- **THEN** the host shows the current workflow stage and does not synthesize its own local next question or draft content

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude V1 with a structured completion state that exposes a reviewable design spec and implementation plan rather than only a lightweight brainstorming recap.

#### Scenario: First-phase workflow completes
- **WHEN** the workflow has completed design approval, spec review, user spec review, and plan generation
- **THEN** the backend emits a completion state that exposes the final `spec + plan` bundle

#### Scenario: Workflow blocks before completion
- **WHEN** the backend cannot complete the internal workflow automatically
- **THEN** the host presents the current reviewable state together with one active request for user guidance

## ADDED Requirements

### Requirement: Hosts present workflow progress in non-technical language
The system MUST present workflow stages to default users without requiring them to understand git, skills, subagents, or internal reviewer terminology.

#### Scenario: Internal automation is active
- **WHEN** the workflow is running a hidden internal step
- **THEN** the default host labels the stage using user-facing language such as drafting, checking, or preparing the next result

#### Scenario: Completion state is shown
- **WHEN** the host presents the final `spec + plan` bundle
- **THEN** it describes the result in user-facing terms rather than engineering workflow jargon
