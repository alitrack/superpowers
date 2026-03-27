## ADDED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question, accepts structured selections or text override, and submits the normalized `answer` through the product UI

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the session view directly instead of instructing the user to switch to the terminal

### Requirement: The product UI hides protocol metadata by default
The system MUST present a product-facing experience rather than a protocol-debug screen.

#### Scenario: Question is rendered for an end user
- **WHEN** the browser shows a structured brainstorming step
- **THEN** protocol fields such as internal type names, question ids, or transport debug markers are hidden unless an explicit debug mode is enabled

#### Scenario: User reviews prior progress
- **WHEN** the browser shows session history or progress
- **THEN** it uses user-facing labels and summaries rather than raw transport payload fields
