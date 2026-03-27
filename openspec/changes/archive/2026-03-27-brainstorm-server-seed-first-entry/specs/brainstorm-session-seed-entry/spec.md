## ADDED Requirements

### Requirement: Browser product captures a session seed before formal brainstorming begins
The system MUST let the user provide a brainstorming topic, problem statement, or decision tension before a new browser session enters the formal structured brainstorming turn sequence.

#### Scenario: User starts a new session from the browser
- **WHEN** the user opens the browser brainstorming product and has no active session yet
- **THEN** the product shows a seed-entry surface instead of immediately rendering a formal backend question

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

### Requirement: Empty-session auto-start is not the default browser experience
The system MUST NOT automatically create an empty brainstorming session on initial page load in the browser product.

#### Scenario: Browser page loads with no saved sessions
- **WHEN** the browser product initializes and the session list is empty
- **THEN** it stays in the seed-entry state and waits for explicit user input instead of auto-creating a new session

#### Scenario: Programmatic caller creates a session without a seed
- **WHEN** a non-browser caller still creates a session with no initial prompt
- **THEN** the system may use the compatibility fallback intake path without changing the primary browser UX
