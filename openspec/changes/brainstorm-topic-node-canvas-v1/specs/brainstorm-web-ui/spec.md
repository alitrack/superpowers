## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and the browser MUST present that flow as a topic-first node canvas where the root topic, single active node, branch context, convergence, and finished-result nodes stay inside the same product workspace.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the active node of the canvas and submits the normalized `answer` through the product UI instead of through a detached central form

#### Scenario: Supporting context is shown
- **WHEN** the browser also needs to show history, progress, adjacent directions, or result context
- **THEN** it presents that information through the node canvas and supporting inspection surfaces rather than as an equal-weight page of supporting cards

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready`
- **THEN** the browser updates the same node canvas directly and keeps the user inside the same topic-rooted product experience instead of instructing the user to switch to the terminal

## ADDED Requirements

### Requirement: The product UI SHALL use user-facing node action labels
The system MUST present canvas actions in product language so users understand what they can do next without seeing workflow internals.

#### Scenario: Active node supports continuation
- **WHEN** the browser renders the current active node
- **THEN** it labels the available actions in user-facing terms such as answering, adding context, or continuing the current line of thought instead of exposing protocol ids or transport terminology

#### Scenario: Completed result is inspected
- **WHEN** the user inspects a convergence or artifact node
- **THEN** the browser uses user-facing labels for actions such as viewing, exporting, or starting another topic instead of exposing raw workflow payload fields
