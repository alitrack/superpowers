## MODIFIED Requirements

### Requirement: Browser brainstorming sessions are isolated and resumable
The system MUST create a distinct backend session for each browser brainstorming flow so concurrent users do not share runtime state, and session creation MUST complete within bounded time by either succeeding, recovering through an allowed fallback path, or returning a recoverable error state to the browser.

#### Scenario: New session is created successfully
- **WHEN** a browser user starts a new brainstorming session
- **THEN** the backend creates a unique session id, initializes isolated runtime state, and returns the first active `question`, `summary`, or `artifact_ready` message within the configured bounded timeout

#### Scenario: New session create stalls
- **WHEN** the real runtime does not produce an initial state within the configured bounded timeout
- **THEN** the backend either recovers through the allowed fallback path or returns a recoverable error that the browser can present and retry instead of hanging indefinitely

### Requirement: Session history is persisted for browser retrieval
The system MUST persist normalized answer history and completion metadata so the browser can render prior progress and recent sessions, and answer submission MUST also complete within bounded time by either advancing, recovering through fallback, or returning a recoverable error.

#### Scenario: Answer is accepted
- **WHEN** the browser submits a valid normalized `answer`
- **THEN** the backend stores the updated history and current session state before returning the next message within the configured bounded timeout

#### Scenario: Answer submit stalls
- **WHEN** the real runtime does not produce the next state within the configured bounded timeout
- **THEN** the backend either advances through the allowed fallback path or returns a recoverable error instead of leaving the browser submit request unresolved indefinitely
