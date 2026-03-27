## MODIFIED Requirements

### Requirement: Browser product captures a session seed before formal brainstorming begins
The system MUST let the user provide a brainstorming topic, problem statement, or decision tension before a new browser session enters the formal structured brainstorming turn sequence, and that seed-entry affordance MUST remain visibly available even when older sessions already exist.

#### Scenario: Browser shows existing sessions
- **WHEN** the browser brainstorming product loads and prior sessions already exist
- **THEN** the product still shows a clear affordance for starting a fresh brainstorm from a new user-provided seed

#### Scenario: User starts a new session from the browser
- **WHEN** the user wants to begin a new brainstorming thread
- **THEN** the product provides a seed-entry surface instead of requiring the user to infer the entry path from old session content

#### Scenario: User submits a seed
- **WHEN** the user enters an initial brainstorming prompt and starts the session
- **THEN** the system creates a session using that prompt as the root seed context for the runtime

### Requirement: Session seed is persisted as root session context
The system MUST persist the initial brainstorming prompt so reload, resume, and fallback runtimes all share the same root topic.

#### Scenario: Seeded session is reloaded
- **WHEN** a seeded session is reopened from persisted storage
- **THEN** the saved seed remains available as part of the session state and does not disappear after the first question

#### Scenario: Different runtimes resume the same session
- **WHEN** app-server or exec fallback resumes a seeded session
- **THEN** both runtimes use the same persisted seed context instead of reconstructing the topic from later history only
