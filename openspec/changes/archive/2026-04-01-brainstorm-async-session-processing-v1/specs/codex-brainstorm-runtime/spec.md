## ADDED Requirements

### Requirement: Long-running runtime turns can continue in background
The system MUST allow real Codex-backed create and submit turns to continue in background after the initiating browser request has returned, while preserving the same structured transport contract for the eventual result.

#### Scenario: Session creation is queued for background execution
- **WHEN** the browser starts a new real-runtime brainstorming session
- **THEN** the backend may return a persisted running session before the first `question`, `summary`, or `artifact_ready` message is ready, and the eventual first message still comes from the real runtime

#### Scenario: Answer submission is queued for background execution
- **WHEN** the browser submits an answer to the active question
- **THEN** the backend persists the pending answer, keeps the current question snapshot stable, and lets the real runtime compute the next message in background

#### Scenario: Background runtime turn finishes
- **WHEN** the real runtime completes a queued turn
- **THEN** the backend normalizes the resulting `question`, `summary`, or `artifact_ready` message into the shared transport contract and persists it onto the session

## MODIFIED Requirements

### Requirement: Real runtime sessions can resume after page reload
The system MUST persist enough provider-backed session state to continue a brainstorming session after reload without silently restarting from the root demo question, including sessions whose current turn is still being processed in background.

#### Scenario: App-server backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the app-server backend
- **THEN** the system restores the persisted backend identity and current active message and continues that same session

#### Scenario: Exec-backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the exec fallback backend
- **THEN** the system rebuilds the next-turn prompt from persisted transcript state and preserves the same current active question until the user answers it

#### Scenario: Background turn is recovered after reload
- **WHEN** the browser reloads a session whose persisted processing state says a real-runtime turn is still running
- **THEN** the system resumes or replays that queued turn from persisted state and eventually writes the next structured message back onto the same session
