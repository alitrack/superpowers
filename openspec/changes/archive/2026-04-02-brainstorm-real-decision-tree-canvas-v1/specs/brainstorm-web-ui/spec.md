## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and the current active decision MUST remain the primary focus of a decision-tree canvas while branch context, checkpoints, and finished-result context stay visible as secondary structure.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the active node of the tree canvas and submits the normalized `answer` through the product UI

#### Scenario: Supporting context is shown
- **WHEN** the browser also needs to show history, adjacent directions, progress, or finished-result context
- **THEN** it presents that information through explicit tree relationships and secondary inspection surfaces rather than as an equal-weight dashboard of grouped panels

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the tree canvas directly and keeps the user inside the same branch-oriented product experience instead of instructing the user to switch to the terminal

### Requirement: The browser SHALL provide explicit async feedback for slow create and submit actions
The browser product SHALL show clear pending, disabled, and failure feedback when creating a session or submitting an answer so slow real-runtime calls do not appear inert.

#### Scenario: Session creation is in progress
- **WHEN** the user starts a new `Artifact Session` or `Summary Session`
- **THEN** the initiating controls become disabled and the product shows visible in-progress feedback until the session is created or the request fails

#### Scenario: Answer submission is in progress
- **WHEN** the user submits the current active question
- **THEN** the submit controls become disabled and the product shows visible in-progress feedback until the next backend message arrives or the request fails

#### Scenario: Session creation or answer submission fails
- **WHEN** the backend request fails or times out
- **THEN** the product shows a visible error message and restores the controls instead of silently appearing unresponsive
