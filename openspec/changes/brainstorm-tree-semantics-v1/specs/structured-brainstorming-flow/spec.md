## MODIFIED Requirements

### Requirement: Structured brainstorming flow SHALL distinguish shortlist state from branch state
The structured brainstorming flow MUST distinguish between candidate options, shortlisted options, and materialized branch runs instead of collapsing all three into a single branch concept.

#### Scenario: Multi-select direction question is answered
- **WHEN** the user answers a branchable `pick_many` direction question with multiple selections
- **THEN** the system records those selections as shortlisted options and does not yet treat them as independent branch runs

#### Scenario: Explicit branch materialization is requested
- **WHEN** the user invokes the branch-materialization action on a shortlist
- **THEN** the flow creates or activates real branch runs that retain parent decision identity and per-branch state

## ADDED Requirements

### Requirement: Structured brainstorming flow SHALL preserve a truthful single-thread mode
The structured brainstorming flow MUST preserve a truthful single-thread mode whenever the user has not materialized branches, so the UI does not imply parallel execution that the runtime has not actually started.

#### Scenario: User keeps the session linear
- **WHEN** the user selects options, criteria, and path without materializing branches
- **THEN** the session continues as one mainline decision path and the tree reflects that single-thread state truthfully
