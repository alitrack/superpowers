## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and that runtime MUST maintain enough strategy state to behave like a brainstorming facilitator rather than a generic structured questionnaire.

#### Scenario: Session starts
- **WHEN** a structured brainstorming session is initialized
- **THEN** the backend runtime emits the first `question`, `summary`, or `artifact_ready` message for the host to render based on the session's initial facilitation state

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime updates the session's facilitation state and decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

### Requirement: Browser structured host behaves as a renderer-only client
The browser structured brainstorming host MUST render backend-provided messages and submit normalized answers without embedding its own branching tree, regardless of whether the backend is scoping the problem, reframing it, generating alternatives, or converging on a path.

#### Scenario: Host receives a question
- **WHEN** the browser host receives a backend-provided `question`
- **THEN** it renders that question as the single active answerable prompt and does not derive an alternate next question locally

#### Scenario: Host submits an answer
- **WHEN** the browser host accepts the user's submission
- **THEN** it emits a normalized `answer` payload and waits for the next backend message before rendering another active question

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST exercise the same transport contract used by future structured brainstorming hosts even as the real provider-backed runtime gains richer brainstorming strategy.

#### Scenario: Demo flow advances
- **WHEN** the local runtime processes a browser-submitted `answer`
- **THEN** the next outbound message still conforms to the existing `question`, `summary`, or `artifact_ready` transport contract

#### Scenario: Provider-backed runtime advances
- **WHEN** the real Codex-backed runtime processes a browser-submitted `answer`
- **THEN** the next outbound message also conforms to the same `question`, `summary`, or `artifact_ready` transport contract
