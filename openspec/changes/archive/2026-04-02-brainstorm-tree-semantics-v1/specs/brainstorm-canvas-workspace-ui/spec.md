## MODIFIED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a decision-tree workspace whose visible nodes reflect semantic roles such as topic, decision, option, branch run, and result, rather than treating every current-question option as if it were already a branch.

#### Scenario: Active session has no materialized branches
- **WHEN** the browser opens a session whose current decision offers selectable options but no branch runs have been created yet
- **THEN** it renders the current decision as a decision node and renders those choices as option nodes or candidate leaves attached to that decision instead of as running branches

#### Scenario: Session contains materialized branch runs
- **WHEN** the session contains one or more branch runs derived from a prior decision
- **THEN** the canvas renders those branch runs as distinct branch-run nodes with explicit parent-child relationships to the source decision

## ADDED Requirements

### Requirement: The browser canvas SHALL distinguish decision, option, and branch-run states
The browser brainstorming canvas SHALL use visibly distinct node roles for `decision`, `option`, and `branch-run` so users can tell whether a node is asking for a decision, presenting a candidate, or representing a real branch context with its own state.

#### Scenario: Current options are shown
- **WHEN** the user is still choosing among candidates for the active decision
- **THEN** option nodes appear as non-running candidates and do not claim branch status

#### Scenario: Branch run is shown
- **WHEN** the user has explicitly materialized one or more selected options into branch runs
- **THEN** each branch-run node shows its own status such as queued, active, paused, or complete
