# codex-brainstorm-runtime Specification

## Purpose
Define how brainstorm-server starts, resumes, and advances a real Codex-backed brainstorming session while keeping the browser host renderer-only.

## Requirements
### Requirement: Browser brainstorming sessions run on a real Codex-backed runtime
The system MUST start or attach a real Codex-backed brainstorming runtime for `/app` sessions instead of binding browser users to the in-process `structured-demo` flow.

#### Scenario: New browser session is created
- **WHEN** the browser creates a new brainstorming session through the product API
- **THEN** the backend starts or attaches a real Codex-backed runtime session and returns its first `question`, `summary`, or `artifact_ready` message

#### Scenario: Demo runtime still exists as a compatibility path
- **WHEN** legacy demo or companion routes are exercised for contract verification
- **THEN** they remain separate from the default `/app` product runtime and do not become the implicit backend for real browser sessions

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

### Requirement: Real runtime sessions can resume after page reload
The system MUST persist enough provider-backed session state to continue a brainstorming session after reload without silently restarting from the root demo question, including sessions whose current turn is still being processed in background and real child branch sessions rooted at historical question snapshots.

#### Scenario: App-server backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the app-server backend
- **THEN** the system restores the persisted backend identity and current active message and continues that same session

#### Scenario: Exec-backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the exec fallback backend
- **THEN** the system rebuilds the next-turn prompt from persisted transcript state and preserves the same current active question until the user answers it

#### Scenario: Background turn is recovered after reload
- **WHEN** the browser reloads a session whose persisted processing state says a real-runtime turn is still running
- **THEN** the system resumes or replays that queued turn from persisted state and eventually writes the next structured message back onto the same session

#### Scenario: Branch session is reloaded
- **WHEN** the browser reopens a topic session that contains persisted child branches
- **THEN** the system restores each branch's persisted backend identity or replayable runtime snapshot so that the selected branch can continue from its own current question

#### Scenario: Branch session starts from a historical question option
- **WHEN** the user opens a new branch from a frozen question snapshot and selected option
- **THEN** the runtime starts a new isolated branch continuation context from that snapshot instead of reusing the mainline provider session in place

### Requirement: Runtime outputs are normalized into the shared structured transport contract
The system MUST translate real Codex runtime outputs into the existing `question`, `summary`, and `artifact_ready` messages consumed by browser and future GUI hosts.

#### Scenario: Codex requests another user decision
- **WHEN** the provider-backed runtime needs more input from the user
- **THEN** it emits a single `question` message using one of the supported structured question types

#### Scenario: Codex finishes the brainstorming step
- **WHEN** the provider-backed runtime determines that questioning is complete
- **THEN** it emits either a `summary` or `artifact_ready` message through the shared transport contract
