## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a session-scoped backend runtime so hosts do not decide what question comes next and concurrent browser sessions do not share one global state.

#### Scenario: Session starts
- **WHEN** a structured brainstorming session is initialized
- **THEN** the backend runtime creates session-local state and emits the first `question` message for that session's host to render

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message for a specific session
- **THEN** the backend runtime updates only that session and decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message
