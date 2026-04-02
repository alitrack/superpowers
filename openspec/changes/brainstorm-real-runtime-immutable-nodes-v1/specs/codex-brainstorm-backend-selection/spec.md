## MODIFIED Requirements

### Requirement: No-backend states fail explicitly instead of silently reverting to demo behavior
The system MUST return an explicit failure when no supported real Codex backend can serve a product brainstorming session, and `/app` product mode MUST NOT substitute fake or demo question generation in place of a live runtime question.

#### Scenario: No supported backend is available at session creation
- **WHEN** neither app-server nor exec fallback can be started for a new `/app` brainstorming session
- **THEN** the system fails session creation explicitly and does not substitute fake question generation or the local `structured-demo` flow

#### Scenario: Persisted session cannot continue with its backend mode
- **WHEN** a previously created real brainstorming session cannot continue because its persisted backend mode is unavailable
- **THEN** the system reports that continuation failure explicitly and does not silently switch the session to fake question generation, a different backend, or demo mode
