# structured-brainstorming-flow Specification

## Purpose
TBD - created by archiving change structured-brainstorming. Update Purpose after archive.
## Requirements
### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable structured brainstorming question at a time so the user can focus on the current decision without scanning unrelated prompts, while also keeping a separate fresh-topic entry affordance available in the browser shell.

#### Scenario: Existing session is open in the browser
- **WHEN** the browser host is showing a previously created brainstorming session
- **THEN** it still exposes a clear path to start a separate new brainstorm without overwriting the currently viewed thread

#### Scenario: Formal questioning begins after seed capture
- **WHEN** a seeded structured brainstorming session starts after the initial user request has been captured
- **THEN** the host renders one formal question and does not render a second unanswered question concurrently inside that session

#### Scenario: Prior answers exist
- **WHEN** the user has already answered earlier questions
- **THEN** the host may show them as read-only history while keeping only one active question available for input for the selected session

### Requirement: Backend controls question sequencing and branching
The system SHALL let the backend decide which question comes next so branching logic stays consistent across hosts and is driven by brainstorming state rather than by hardcoded host-side start flows.

#### Scenario: Answer is submitted
- **WHEN** the host sends a normalized `answer` message
- **THEN** the backend decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

#### Scenario: Multiple hosts implement the same flow
- **WHEN** browser and terminal hosts use the same backend with the same initial seed context
- **THEN** they follow the same branching path for the same sequence of normalized answers

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer and input collector rather than a branching engine, even when the backend internally moves between scoping, reframing, divergence, convergence, and handoff stages.

#### Scenario: User submits a seed
- **WHEN** the browser host captures the initial brainstorming prompt before session creation
- **THEN** it creates the session and waits for the first backend-generated formal question instead of synthesizing one locally

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message instead of deciding the next question locally

#### Scenario: Summary is received
- **WHEN** the backend emits a `summary`
- **THEN** the host transitions from question entry to review mode and stops presenting another unanswered question

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude the questioning phase with a structured completion message that downstream workflows can consume directly, including the selected direction and enough context about the reasoning path that led there.

#### Scenario: Session converges without file output
- **WHEN** enough information has been collected but no output file exists yet
- **THEN** the backend emits a `summary` that restates the selected path and the important decisions behind it

#### Scenario: Session converges with file output
- **WHEN** the questioning phase produces a concrete deliverable
- **THEN** the backend emits `artifact_ready` so the host can link to or display the resulting artifact
