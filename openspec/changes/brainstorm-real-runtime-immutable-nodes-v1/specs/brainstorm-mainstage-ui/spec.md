## ADDED Requirements

### Requirement: Mainstage focus SHALL follow immutable node history
The browser brainstorming product MUST derive its active-node focus from the persisted immutable node history so the currently answerable node can change without rewriting previously generated nodes.

#### Scenario: Active node advances linearly
- **WHEN** the user answers the current question and the runtime returns the next question
- **THEN** the mainstage focus moves to the newly appended child node while the previously focused node remains visible as an unchanged historical ancestor

#### Scenario: Active node switches to a branch
- **WHEN** the user selects a branch child node from the tree
- **THEN** the mainstage focus switches to that existing branch node without changing the stored content of the source parent node or sibling nodes
