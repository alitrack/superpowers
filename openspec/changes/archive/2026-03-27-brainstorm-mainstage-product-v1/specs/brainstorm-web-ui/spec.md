## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and the current active decision MUST remain the primary focus of the product shell while supporting context stays secondary.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the dominant mainstage element and submits the normalized `answer` through the product UI

#### Scenario: Supporting context is shown
- **WHEN** the browser also needs to show history, progress, or adjacent context
- **THEN** it presents that information in secondary supporting surfaces rather than giving it equal weight with the active decision

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the session view directly instead of instructing the user to switch to the terminal
