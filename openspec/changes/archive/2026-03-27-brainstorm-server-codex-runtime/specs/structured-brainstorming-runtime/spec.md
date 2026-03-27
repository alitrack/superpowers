## ADDED Requirements

### Requirement: Provider-backed runtime persists resumable session continuity
The system MUST persist provider-backed runtime state so a structured brainstorming session can continue after reload without losing the current active message.

#### Scenario: Runtime state is saved after a turn
- **WHEN** a provider-backed structured brainstorming session emits a new `question`, `summary`, or `artifact_ready`
- **THEN** the system persists the current active message, normalized history, and provider session metadata needed to continue later

#### Scenario: Runtime state is restored before the next turn
- **WHEN** a persisted structured brainstorming session is resumed
- **THEN** the runtime restores the saved state before accepting another browser-submitted `answer`

## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next.

#### Scenario: Session starts
- **WHEN** a structured brainstorming session is initialized through the real product runtime
- **THEN** the backend runtime emits the first `question`, `summary`, or `artifact_ready` message for the host to render

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime updates only that session and decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

### Requirement: Browser structured host behaves as a renderer-only client
The browser structured brainstorming host MUST render backend-provided messages and submit normalized answers without embedding its own branching tree.

#### Scenario: Host receives a question
- **WHEN** the browser host receives a backend-provided `question`
- **THEN** it renders that question as the single active answerable prompt and does not derive an alternate next question locally

#### Scenario: Host submits an answer
- **WHEN** the browser host accepts the user's submission
- **THEN** it emits a normalized `answer` payload and waits for the next backend message before rendering another active question

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST keep its local demo/runtime path contract-compatible with the real product runtime so developer verification does not drift from browser-product expectations.

#### Scenario: Demo flow advances
- **WHEN** the local demo runtime processes a browser-submitted `answer`
- **THEN** the next outbound message still conforms to the existing `question`, `summary`, or `artifact_ready` transport contract

#### Scenario: Product runtime advances
- **WHEN** the real Codex-backed runtime processes a browser-submitted `answer`
- **THEN** the next outbound message also conforms to the same `question`, `summary`, or `artifact_ready` transport contract
