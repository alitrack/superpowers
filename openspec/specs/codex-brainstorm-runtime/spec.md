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

### Requirement: Real runtime sessions can resume after page reload
The system MUST persist enough provider-backed session state to continue a brainstorming session after reload without silently restarting from the root demo question.

#### Scenario: App-server backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the app-server backend
- **THEN** the system restores the persisted backend identity and current active message and continues that same session

#### Scenario: Exec-backed session is reloaded
- **WHEN** the browser reopens an existing session that uses the exec fallback backend
- **THEN** the system rebuilds the next-turn prompt from persisted transcript state and preserves the same current active question until the user answers it

### Requirement: Runtime outputs are normalized into the shared structured transport contract
The system MUST translate real Codex runtime outputs into the existing `question`, `summary`, and `artifact_ready` messages consumed by browser and future GUI hosts.

#### Scenario: Codex requests another user decision
- **WHEN** the provider-backed runtime needs more input from the user
- **THEN** it emits a single `question` message using one of the supported structured question types

#### Scenario: Codex finishes the brainstorming step
- **WHEN** the provider-backed runtime determines that questioning is complete
- **THEN** it emits either a `summary` or `artifact_ready` message through the shared transport contract
