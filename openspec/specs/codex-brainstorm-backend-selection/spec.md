# codex-brainstorm-backend-selection Specification

## Purpose
Define app-server-first backend selection, `codex exec` fallback behavior, and how degraded backend mode is persisted per brainstorming session.

## Requirements
### Requirement: Session startup prefers app-server and falls back to exec
The system MUST attempt to start brainstorming sessions with `codex app-server` first and only fall back to `codex exec` when app-server is unavailable for that session.

#### Scenario: App-server is available
- **WHEN** a new brainstorming session is created and `codex app-server` can be initialized
- **THEN** the system selects app-server mode for that session and records that backend mode in persisted session state

#### Scenario: App-server is unavailable but exec is available
- **WHEN** a new brainstorming session is created and app-server initialization fails before the session is established
- **THEN** the system falls back to `codex exec` and records the fallback backend mode in persisted session state

### Requirement: A session keeps the same backend mode for its lifetime
The system MUST reuse the backend mode selected at session creation for all later turns in that session rather than renegotiating a new provider mode for each answer.

#### Scenario: Existing session continues
- **WHEN** the user submits another answer in an existing brainstorming session
- **THEN** the system continues using the persisted backend mode for that session

#### Scenario: Existing session is reopened
- **WHEN** the browser reloads or lists a previously created brainstorming session
- **THEN** the session metadata still reflects the backend mode originally selected for that session

### Requirement: No-backend states fail explicitly instead of silently reverting to demo behavior
The system MUST return an explicit failure when no supported Codex backend can serve a real brainstorming session.

#### Scenario: No supported backend is available at session creation
- **WHEN** neither app-server nor exec fallback can be started for a new brainstorming session
- **THEN** the system fails session creation explicitly and does not substitute the local `structured-demo` flow

#### Scenario: Persisted session cannot continue with its backend mode
- **WHEN** a previously created real brainstorming session cannot continue because its persisted backend mode is unavailable
- **THEN** the system reports that continuation failure explicitly and does not silently switch the session to a different backend or demo flow
