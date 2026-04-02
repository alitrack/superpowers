## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and create/submit actions MUST remain usable even when a prior background job has become stale, retryable, or cancelled.

#### Scenario: Reopened session needs attention
- **WHEN** the browser opens a session whose lifecycle state is `retryable`
- **THEN** the UI shows that the last background turn needs attention and presents product-facing `Retry` and `Cancel` actions instead of pretending the session is still actively processing

#### Scenario: User retries a retryable session from the browser
- **WHEN** the user clicks `Retry` for a session whose lifecycle state is `retryable`
- **THEN** the browser requeues that persisted background action, shows the session as running again, and keeps the frozen current question/result visible until the new turn completes

#### Scenario: User cancels a background session from the browser
- **WHEN** the user clicks `Cancel` for a running or retryable session
- **THEN** the browser updates the session UX to the cancelled state and does not keep the old submit path active as if the background turn were still in progress
