## MODIFIED Requirements

### Requirement: Browser product captures a session seed before formal brainstorming begins
The system MUST let the user provide one explicit brainstorming topic, problem statement, or decision tension before a new browser session enters the formal structured brainstorming turn sequence, and the browser MUST treat that seed-entry surface as the single formal starting point of a new brainstorm rather than pairing it with duplicate start inputs or a system-authored first question.

#### Scenario: Browser shows existing sessions
- **WHEN** the browser brainstorming product loads and prior sessions already exist
- **THEN** it still shows exactly one clear affordance for starting a fresh brainstorm from a new user-provided topic instead of hiding the entry behind session history or rendering multiple competing start inputs

#### Scenario: User submits a seed
- **WHEN** the user enters an initial brainstorming prompt and starts the session
- **THEN** the system creates the session using that prompt as the root seed context and the browser renders that prompt as the root topic node of the canvas before or alongside the first backend-authored active node

### Requirement: Session seed is persisted as root session context
The system MUST persist the initial brainstorming prompt as stable root session context so reload, resume, and fallback runtimes reopen the same canvas around the same topic node instead of reconstructing the topic from later steps only.

#### Scenario: Seeded session is reloaded
- **WHEN** a seeded session is reopened from persisted storage
- **THEN** the saved seed remains visible as the root topic node of the browser canvas even after later branch, summary, or artifact nodes have been added

#### Scenario: Different runtimes resume the same session
- **WHEN** app-server or exec fallback resumes a seeded session
- **THEN** both runtimes use the same persisted seed context and the browser does not replace that root topic with a generated summary label
