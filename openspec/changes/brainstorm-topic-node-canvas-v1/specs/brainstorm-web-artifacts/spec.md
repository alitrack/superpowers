## MODIFIED Requirements

### Requirement: Completed browser sessions can produce real persisted artifacts
The system MUST persist concrete brainstorming outputs so a completed session can end with a real `artifact_ready` result that is represented in the browser as an artifact node linked to the completed convergence context instead of only a transient summary panel or detached file path.

#### Scenario: Session completes with a materialized output
- **WHEN** the backend generates a concrete result such as a markdown summary, structured result payload, or supporting bundle file
- **THEN** it stores the finished-result exports, records their metadata on the session, and gives the browser enough persisted data to render a finished artifact node with export actions and source context

#### Scenario: Browser opens a completed result
- **WHEN** the browser loads a session whose completion state is `artifact_ready`
- **THEN** it displays the normalized finished result as a canvas artifact node and can retrieve the persisted result exports and supporting artifact metadata using the stored session data

### Requirement: Sessions preserve summaries even when no artifact file exists
The system MUST persist `summary`-level completion states so users can review converged sessions through a convergence node even when no file artifact exists yet.

#### Scenario: Session ends with summary only
- **WHEN** the backend determines that the session is complete without a materialized file
- **THEN** it stores the `summary` payload and makes it available through the browser as a convergence node that still preserves the explored answer path

#### Scenario: User revisits a summary-complete session
- **WHEN** the browser reopens a completed session whose state is `summary`
- **THEN** it renders the stored convergence result and answer path from persisted session data without requiring the session to be recomputed
