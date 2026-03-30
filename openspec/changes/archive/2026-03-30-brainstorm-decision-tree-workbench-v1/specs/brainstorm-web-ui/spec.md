## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and the current active decision MUST remain the primary focus of a decision-tree workbench while branch context, checkpoints, and finished-result context stay visible as secondary workspace structure.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the active node of the workbench and submits the normalized `answer` through the product UI

#### Scenario: Supporting context is shown
- **WHEN** the browser also needs to show history, progress, adjacent directions, or result context
- **THEN** it presents that information through the decision tree and supporting workbench panels rather than as an equal-weight page of supporting cards

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the workbench directly and keeps the user inside the same branch-oriented product experience instead of instructing the user to switch to the terminal
