## MODIFIED Requirements

### Requirement: Supporting canvas cards SHALL remain inspectable without becoming new active questions
The browser brainstorming product SHALL allow users to inspect non-active tree nodes and supporting workbench panels such as prior steps, shortlisted directions, review drafts, and completion artifacts without turning them into concurrent answerable decisions, and non-active question rounds MUST render as read-only question snapshots rather than as rewritten summary cards.

#### Scenario: User inspects a supporting node
- **WHEN** the user selects a non-active node or supporting workspace panel
- **THEN** the browser shows its details in a contextual inspection surface while keeping the active node as the only input target

#### Scenario: Historical question node stays frozen
- **WHEN** a previously generated question round is shown after the session has advanced to a later round
- **THEN** the canvas renders that historical round from its stored question snapshot and does not replace its visible structure with an answer-summary-only presentation

### Requirement: The decision tree SHALL be derived from persisted round history without re-identifying prior nodes from mutable current question state
The browser brainstorming product SHALL derive visible historical round identity from persisted round or node history when available, and MUST NOT rely on mutable current-question identifiers to decide which prior question node is being shown.

#### Scenario: Repeated provider question ids exist
- **WHEN** the runtime emits multiple successive questions that reuse the same provider-level `questionId`
- **THEN** the browser still renders distinct historical rounds using persisted round identity and keeps previously shown question nodes visually unchanged

#### Scenario: Persisted round history is available
- **WHEN** the session payload includes persisted `roundGraph` or equivalent round history from the backend
- **THEN** the canvas uses that persisted history as the authoritative source for historical question display instead of rebuilding historical node identity from `currentMessage.questionId`
