## MODIFIED Requirements

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude the questioning phase with a structured completion message that downstream workflows can consume directly, and that completion message MUST represent a finished brainstorming deliverable rather than only a selected-path recap.

#### Scenario: Session converges without file output
- **WHEN** enough information has been collected and the finished deliverable is complete but no output file exists yet
- **THEN** the backend emits a `summary` that presents the mature brainstorming result instead of merely restating the selected path

#### Scenario: Session converges with file output
- **WHEN** the finished deliverable is complete and a concrete artifact file exists
- **THEN** the backend emits `artifact_ready` so the host can display or link to the mature brainstorming deliverable

### Requirement: Hosts present the finished artifact as the primary completion state
The system MUST treat the finished brainstorming artifact as the primary end-state of the browser flow rather than presenting completion as a thin questionnaire recap.

#### Scenario: Completed session is opened in the browser
- **WHEN** a user opens a completed brainstorming session
- **THEN** the host presents the finished brainstorming artifact as the main completion view

#### Scenario: Session is still in progress
- **WHEN** a brainstorming session has not yet passed the completion gate
- **THEN** the host continues to present the active question flow rather than an incomplete result
