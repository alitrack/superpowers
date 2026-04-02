## MODIFIED Requirements

### Requirement: Long-running runtime turns can continue in background
The system MUST allow real Codex-backed create and submit turns to continue in background after the initiating browser request has returned, while also ensuring stalled, timed out, or superseded background work resolves into deterministic lifecycle state instead of leaving the session permanently ambiguous.

#### Scenario: Runtime turn exceeds worker deadline
- **WHEN** a background create or submit turn exceeds the configured worker timeout
- **THEN** the backend records that turn as `retryable`, preserves the last stable visible question/result, and surfaces the failure through persisted lifecycle metadata instead of only returning a transient HTTP timeout

#### Scenario: Retry starts a fresh background turn
- **WHEN** a user retries a `retryable` create or submit turn
- **THEN** the backend starts a new background runtime turn from the persisted session snapshot and supersedes the prior job id

#### Scenario: Superseded turn completes after retry or cancel
- **WHEN** an older runtime turn completes after a newer retry/cancel action has already superseded it
- **THEN** the backend discards that older turn's result and does not overwrite the current session state
