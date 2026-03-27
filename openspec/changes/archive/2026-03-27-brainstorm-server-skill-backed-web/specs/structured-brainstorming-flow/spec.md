## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable structured brainstorming question at a time so the user can focus on the current decision without scanning unrelated prompts, while also keeping a separate fresh-topic entry affordance available in the browser shell.

#### Scenario: Existing session is open in the browser
- **WHEN** the browser host is showing a previously created brainstorming session
- **THEN** it still exposes a clear path to start a separate new brainstorm without overwriting the currently viewed thread

#### Scenario: Formal questioning begins after seed capture
- **WHEN** a seeded structured brainstorming session starts after the initial user request has been captured
- **THEN** the host renders one formal question and does not render a second unanswered question concurrently inside that session

#### Scenario: Prior answers exist
- **WHEN** the user has already answered earlier questions
- **THEN** the host may show them as read-only history while keeping only one active question available for input for the selected session
