# structured-brainstorming-runtime Specification

## Purpose
Define the backend-side runtime behavior that owns structured brainstorming session state and question sequencing while keeping hosts renderer-only.

## Requirements
### Requirement: Provider-backed runtime persists resumable session continuity
The system MUST persist provider-backed runtime state so a structured brainstorming session can continue after reload without losing the current active message.

#### Scenario: Runtime state is saved after a turn
- **WHEN** a provider-backed structured brainstorming session emits a new `question`, `summary`, or `artifact_ready`
- **THEN** the system persists the current active message, normalized history, and provider session metadata needed to continue later

#### Scenario: Runtime state is restored before the next turn
- **WHEN** a persisted structured brainstorming session is resumed
- **THEN** the runtime restores the saved state before accepting another browser-submitted `answer`

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and the real Codex-backed path MUST continue the session until the finished-deliverable completion gate is satisfied rather than stopping at the first lightweight handoff.

#### Scenario: Session starts from a user seed
- **WHEN** a structured brainstorming session is initialized from a user-provided seed
- **THEN** the backend runtime owns both question sequencing and finished-deliverable completion logic

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime decides whether to emit another `question`, continue internal synthesis, or produce a completed deliverable only after the completion gate is satisfied

#### Scenario: Handoff phase is reached before the deliverable is mature
- **WHEN** the runtime has enough state to enter handoff but the finished deliverable is still incomplete
- **THEN** it does not emit final completion and instead continues the session toward a mature deliverable

### Requirement: Browser structured host behaves as a renderer-only client
The browser structured brainstorming host MUST render backend-provided messages and submit normalized answers without embedding its own branching tree, while owning only the pre-session seed capture needed to start the runtime with the correct topic.

#### Scenario: Host receives a question
- **WHEN** the browser host receives a backend-provided `question`
- **THEN** it renders that question as the single active answerable prompt and does not derive an alternate next question locally

#### Scenario: Host submits an answer
- **WHEN** the browser host accepts the user's submission
- **THEN** it emits a normalized `answer` payload and waits for the next backend message before rendering another active question

#### Scenario: Host creates a seeded session
- **WHEN** the browser host sends the initial brainstorming prompt at session creation time
- **THEN** it does not also invent a separate local first question for the runtime to answer

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST exercise the same transport contract used by future structured brainstorming hosts even when the real Codex-backed path is skill-backed.

#### Scenario: Real Codex-backed runtime advances
- **WHEN** the real Codex-backed runtime processes a seeded browser-created session
- **THEN** the next outbound message conforms to the existing `question`, `summary`, or `artifact_ready` transport contract

#### Scenario: Fake fallback runtime advances
- **WHEN** the local fake runtime processes the same contract flow for tests
- **THEN** it remains contract-compatible without claiming to be the full skill-backed production path
