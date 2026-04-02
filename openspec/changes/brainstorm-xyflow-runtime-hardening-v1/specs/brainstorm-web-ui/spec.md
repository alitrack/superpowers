## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and the browser MUST render that flow through a graph workspace where the single active question remains embedded in the active node.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision inside the active graph node and submits the normalized `answer` from that node

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the same graph workspace and moves focus to the next active node or completion cluster instead of switching to a detached layout mode

## ADDED Requirements

### Requirement: Browser node actions SHALL stay user-facing while graph internals remain hidden
The system MUST present node actions and node labels in user-facing language while hiding graph engine internals, transport identifiers, and protocol debug information by default.

#### Scenario: User interacts with the active node
- **WHEN** the browser renders the active-question node
- **THEN** the visible actions describe the user task in product language rather than exposing graph or transport implementation details

#### Scenario: User inspects a convergence or artifact node
- **WHEN** the user selects a completed result node
- **THEN** the browser shows viewing and export actions in product-facing language without surfacing graph engine metadata
