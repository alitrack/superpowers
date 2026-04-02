## MODIFIED Requirements

### Requirement: Browser brainstorming sessions are isolated and resumable
The system MUST create a distinct backend session for each browser brainstorming flow so concurrent users do not share runtime state, and it MUST persist explicit lifecycle state for in-flight create/submit work so a reopened session can be understood as `running`, `retryable`, `cancelled`, or `idle` instead of remaining ambiguously stuck.

#### Scenario: Stale running session is reopened
- **WHEN** a browser user reopens a session whose persisted processing job has lost its runner lease or heartbeat beyond the configured stale threshold
- **THEN** the backend marks that session as `retryable` and preserves the last stable visible session state instead of leaving it indefinitely in `running`

#### Scenario: User retries a retryable job
- **WHEN** the user requests retry for a session whose current processing state is `retryable`
- **THEN** the backend creates a new processing job from the persisted pending action and last stable session snapshot without requiring the user to re-enter the original input

#### Scenario: User cancels a running or retryable job
- **WHEN** the user cancels a session whose processing state is `running` or `retryable`
- **THEN** the backend transitions that processing record to `cancelled`, preserves the last stable session message, and prevents the cancelled job from writing late results back into the session

### Requirement: Session history is persisted for browser retrieval
The system MUST persist normalized answer history, completion metadata, and lifecycle metadata so the browser can render prior progress, distinguish active work from attention-needed states, and ignore superseded background writes safely.

#### Scenario: Background job heartbeat is persisted
- **WHEN** a create or submit worker is still actively processing a session
- **THEN** the backend updates persisted lease/heartbeat metadata so a reopened browser can tell that the job is still healthy

#### Scenario: Superseded job finishes late
- **WHEN** an older background worker completes after the session has already been retried, cancelled, or deleted
- **THEN** the backend ignores that late result because its job id no longer matches the current persisted processing record

#### Scenario: Session list is requested
- **WHEN** the browser asks for recent or resumable sessions
- **THEN** the backend returns enough lifecycle metadata to distinguish idle, running, retryable, and cancelled sessions
