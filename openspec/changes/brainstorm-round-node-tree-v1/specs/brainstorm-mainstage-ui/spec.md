## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active round node the dominant visual focus of the workbench mainstage instead of giving equal weight to surrounding tree structure, option candidates, or inspection panels.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the primary workbench stage as one active round node while prior rounds and sibling branches remain visually secondary

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a contextual workbench panel while the single active review round remains the primary focus and no other tree node becomes concurrently answerable
