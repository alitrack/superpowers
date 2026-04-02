## MODIFIED Requirements

### Requirement: Browser brainstorming sessions are isolated and resumable
The system MUST create a distinct backend session for each browser brainstorming flow so concurrent users do not share runtime state, and it MUST also persist real child branch sessions inside the same topic session without letting them overwrite each other.

#### Scenario: Mainline and branch sessions are both persisted
- **WHEN** a topic session contains the mainline plus one or more child branches
- **THEN** the backend persists each branch session's current state alongside the mainline so the tree can be restored after reload

#### Scenario: One branch advances
- **WHEN** a selected branch session continues to its next runtime turn
- **THEN** the persisted state of the mainline and untouched sibling branches remains unchanged

#### Scenario: Existing branch is reopened
- **WHEN** the user reopens a topic session with persisted branches
- **THEN** the backend restores the full tree, branch statuses, and active branch selection without recomputing the original branch anchors
