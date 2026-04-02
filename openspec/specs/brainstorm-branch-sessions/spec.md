# brainstorm-branch-sessions Specification

## Purpose
Define how a browser brainstorming topic can spawn and continue real isolated branch sessions from frozen historical question nodes.

## Requirements
### Requirement: Historical question nodes can spawn real isolated branch sessions
The system MUST allow a frozen historical question node to spawn a new isolated branch session from a selected option, and that branch MUST continue through the real runtime instead of collapsing into a local-only summary note.

#### Scenario: User opens a branch from a historical question option
- **WHEN** the user selects an option on a previously generated frozen question node and chooses to start a branch from it
- **THEN** the backend creates a new branch session context rooted at that question snapshot and selected option

#### Scenario: Branch continues through the real runtime
- **WHEN** the user answers the current question inside an active branch session
- **THEN** the backend advances that branch through the real runtime and persists the branch's next `question`, `summary`, or `artifact_ready`

#### Scenario: Sibling branches remain isolated
- **WHEN** one branch session advances or completes
- **THEN** the mainline and all sibling branch sessions keep their own provider state, history, and current messages unchanged

### Requirement: Branch selection is tree-driven and scopes the active input surface
The system MUST let the user switch the active context by selecting a branch node in the tree, and the active input surface MUST only show the current question for that selected branch or the mainline.

#### Scenario: User selects a branch node
- **WHEN** the user clicks a branch node in the decision tree
- **THEN** that branch becomes the active context and the main input area shows only that branch's current question and options

#### Scenario: User returns to the mainline
- **WHEN** the user selects the mainline current question path from the tree
- **THEN** the active input area returns to the mainline question and does not keep the branch input active
