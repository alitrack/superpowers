## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable structured brainstorming question at a time so the user can focus on the current decision without scanning unrelated prompts, while allowing a pre-session seed-entry surface before the first formal brainstorming question exists.

#### Scenario: Session begins from a browser seed-entry flow
- **WHEN** the browser host has not yet created a session and is waiting for the user to provide the brainstorming topic
- **THEN** it shows the seed-entry surface and does not render any formal unanswered backend question yet

#### Scenario: Formal questioning begins after seed capture
- **WHEN** a seeded structured brainstorming session starts after the initial user request has been captured
- **THEN** the host renders one formal question and does not render a second unanswered question concurrently

#### Scenario: Prior answers exist
- **WHEN** the user has already answered earlier questions
- **THEN** the host may show them as read-only history while keeping only one active question available for input

### Requirement: Backend controls question sequencing and branching
The system SHALL let the backend decide which question comes next so branching logic stays consistent across hosts and is driven by brainstorming state rather than by hardcoded host-side start flows.

#### Scenario: Answer is submitted
- **WHEN** the host sends a normalized `answer` message
- **THEN** the backend decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

#### Scenario: Multiple hosts implement the same flow
- **WHEN** browser and terminal hosts use the same backend with the same initial seed context
- **THEN** they follow the same branching path for the same sequence of normalized answers

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer and input collector rather than a branching engine, while still allowing the host to collect the initial seed before the first backend question exists.

#### Scenario: User submits a seed
- **WHEN** the browser host captures the initial brainstorming prompt before session creation
- **THEN** it creates the session and waits for the first backend-generated formal question instead of synthesizing one locally

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message instead of deciding the next question locally

#### Scenario: Summary is received
- **WHEN** the backend emits a `summary`
- **THEN** the host transitions from question entry to review mode and stops presenting another unanswered question
