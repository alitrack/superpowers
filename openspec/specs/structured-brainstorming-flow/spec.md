# structured-brainstorming-flow Specification

## Purpose
TBD - created by archiving change structured-brainstorming. Update Purpose after archive.
## Requirements
### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time, and the host SHALL present that decision as the dominant anchor element in the canvas workspace while limiting default visible supporting history to lightweight recent context.

#### Scenario: Current active decision is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single decision as the dominant anchor card and does not give equal visual weight to unrelated workspace cards

#### Scenario: Prior answers exist
- **WHEN** earlier steps have already been completed
- **THEN** the host may show recent supporting context for only the most recent `2-3` steps as supporting workspace cards by default while keeping the current active decision primary

#### Scenario: Full history is requested
- **WHEN** the user explicitly asks to review the full prior thread
- **THEN** the host reveals the broader history through the canvas workspace without replacing the current anchor focus unless the session is already complete

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
- **THEN** the host waits for the next backend message instead of deciding the next question locally

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

### Requirement: Hosts present workflow progress in non-technical language
The system MUST present workflow stages to default users without requiring them to understand git, skills, subagents, or internal reviewer terminology.

#### Scenario: Internal automation is active
- **WHEN** the workflow is running a hidden internal step
- **THEN** the default host labels the stage using user-facing language such as drafting, checking, or preparing the next result

#### Scenario: Completion state is shown
- **WHEN** the host presents the final `spec + plan` bundle
- **THEN** it describes the result in user-facing terms rather than engineering workflow jargon

