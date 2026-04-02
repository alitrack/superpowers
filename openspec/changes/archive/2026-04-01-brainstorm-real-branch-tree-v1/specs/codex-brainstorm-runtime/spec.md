## MODIFIED Requirements

### Requirement: Real runtime sessions can resume after page reload
The system MUST persist enough provider-backed session state to continue a brainstorming session after reload without silently restarting from the root demo question, including real child branch sessions rooted at historical question snapshots.

#### Scenario: Mainline session is reloaded
- **WHEN** the browser reopens the topic session
- **THEN** the system restores the persisted mainline backend identity and current active message and continues that same mainline session

#### Scenario: Branch session is reloaded
- **WHEN** the browser reopens a topic session that contains persisted child branches
- **THEN** the system restores each branch's persisted backend identity or replayable runtime snapshot so that the selected branch can continue from its own current question

#### Scenario: Branch session starts from a historical question option
- **WHEN** the user opens a new branch from a frozen question snapshot and selected option
- **THEN** the runtime starts a new isolated branch continuation context from that snapshot instead of reusing the mainline provider session in place
