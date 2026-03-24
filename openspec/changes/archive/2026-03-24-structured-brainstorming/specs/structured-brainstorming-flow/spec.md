## ADDED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable structured brainstorming question at a time so the user can focus on the current decision without scanning unrelated prompts.

#### Scenario: Session begins
- **WHEN** a structured brainstorming session starts after the initial user request
- **THEN** the host renders one formal question and does not render a second unanswered question concurrently

#### Scenario: Prior answers exist
- **WHEN** the user has already answered earlier questions
- **THEN** the host may show them as read-only history while keeping only one active question available for input

### Requirement: Backend controls question sequencing and branching
The system SHALL let the backend decide which question comes next so branching logic stays consistent across hosts and is not hardcoded into individual renderers.

#### Scenario: Answer is submitted
- **WHEN** the host sends a normalized `answer` message
- **THEN** the backend decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

#### Scenario: Multiple hosts implement the same flow
- **WHEN** browser and terminal hosts use the same backend
- **THEN** they follow the same branching path for the same sequence of normalized answers

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer and input collector rather than a branching engine.

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message instead of deciding the next question locally

#### Scenario: Summary is received
- **WHEN** the backend emits a `summary`
- **THEN** the host transitions from question entry to review mode and stops presenting another unanswered question

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude the questioning phase with a structured completion message that downstream workflows can consume directly.

#### Scenario: Session converges without file output
- **WHEN** enough information has been collected but no output file exists yet
- **THEN** the backend emits a `summary` that restates the selected path

#### Scenario: Session converges with file output
- **WHEN** the questioning phase produces a concrete deliverable
- **THEN** the backend emits `artifact_ready` so the host can link to or display the resulting artifact
