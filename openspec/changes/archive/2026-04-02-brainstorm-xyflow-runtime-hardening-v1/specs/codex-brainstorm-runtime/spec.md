## MODIFIED Requirements

### Requirement: Browser brainstorming sessions run on a real Codex-backed runtime
The system MUST start or attach a real Codex-backed brainstorming runtime for `/app` sessions instead of binding browser users to the in-process `structured-demo` flow, and runtime creation MUST fail over or fail visibly when the provider stalls.

#### Scenario: New browser session is created
- **WHEN** the browser creates a new brainstorming session through the product API
- **THEN** the backend starts or attaches a real Codex-backed runtime session and returns its first `question`, `summary`, or `artifact_ready` message within the configured bounded timeout

#### Scenario: Runtime create stalls
- **WHEN** the provider-backed runtime does not return the initial message within the configured bounded timeout
- **THEN** the runtime layer triggers the allowed fallback path or returns a recoverable create failure so the browser request does not hang indefinitely

### Requirement: Real runtime sessions can resume after page reload
The system MUST persist enough provider-backed session state to continue a brainstorming session after reload without silently restarting from the root demo question.

#### Scenario: App-server backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the app-server backend
- **THEN** the system restores the persisted backend identity and current active message and continues that same session

#### Scenario: Exec-backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the exec fallback backend
- **THEN** the system rebuilds the next-turn prompt from persisted transcript state and preserves the same current active question until the user answers it

## ADDED Requirements

### Requirement: Real runtime answer submission SHALL not hang indefinitely
The runtime layer MUST bound the time spent waiting for the provider-backed next message after a browser answer is submitted.

#### Scenario: Real provider returns the next step in time
- **WHEN** the browser submits an answer and the provider-backed runtime responds within the configured bounded timeout
- **THEN** the runtime layer returns the next normalized `question`, `summary`, or `artifact_ready` message

#### Scenario: Real provider stalls on the next step
- **WHEN** the browser submits an answer and the provider-backed runtime does not respond within the configured bounded timeout
- **THEN** the runtime layer triggers the allowed fallback path or returns a recoverable error instead of leaving the answer submission unresolved
