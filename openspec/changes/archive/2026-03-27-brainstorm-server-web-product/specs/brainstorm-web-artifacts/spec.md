## ADDED Requirements

### Requirement: Completed browser sessions can produce real persisted artifacts
The system MUST persist concrete brainstorming outputs so a completed session can end with a real `artifact_ready` result rather than a transient demo-only summary.

#### Scenario: Session completes with a materialized output
- **WHEN** the backend generates a concrete result such as a markdown summary or structured output file
- **THEN** it stores the artifact, records its metadata on the session, and emits `artifact_ready`

#### Scenario: Browser opens a completed result
- **WHEN** the browser loads a session whose completion state is `artifact_ready`
- **THEN** it can display or retrieve the stored artifact using the persisted metadata

### Requirement: Sessions preserve summaries even when no artifact file exists
The system MUST persist `summary`-level completion states so users can review converged sessions that do not yet produce a file artifact.

#### Scenario: Session ends with summary only
- **WHEN** the backend determines that the session is complete without a materialized file
- **THEN** it stores the `summary` payload and makes it available through the browser session history

#### Scenario: User revisits a summary-complete session
- **WHEN** the browser reopens a completed session whose state is `summary`
- **THEN** it renders the stored summary and answer path without requiring the session to be recomputed
