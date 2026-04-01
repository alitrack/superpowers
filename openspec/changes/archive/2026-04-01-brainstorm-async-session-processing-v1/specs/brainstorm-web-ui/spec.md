## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and create/submit actions MUST remain usable even when the real runtime needs longer background processing time than a single browser request can reasonably hold open.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the active node of the workbench and submits the normalized `answer` through the product UI

#### Scenario: Answer enters background processing
- **WHEN** the user submits an answer and the backend accepts it for background execution
- **THEN** the browser keeps the current question node visible, shows a user-facing processing state, and prevents duplicate submissions for that same active turn

#### Scenario: In-flight session is reopened
- **WHEN** the user returns to a session whose backend state is still processing
- **THEN** the browser shows that the session is still running, refreshes from the persisted session API, and updates the workbench when the next `question`, `summary`, or `artifact_ready` arrives

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the workbench directly and keeps the user inside the same branch-oriented product experience instead of instructing the user to switch to the terminal
