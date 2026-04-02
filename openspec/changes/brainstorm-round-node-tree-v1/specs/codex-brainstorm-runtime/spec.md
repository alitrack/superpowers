## ADDED Requirements

### Requirement: Runtime sessions SHALL persist round-node lineage for browser tree restoration
The system MUST persist enough round-node lineage and source-answer metadata inside each brainstorming session so the browser can restore the same trunk and explicit branch subtrees after reload without guessing tree structure from transient option lists.

#### Scenario: Linear answer advances the trunk
- **WHEN** the user answers the current active round in a non-forking path
- **THEN** the runtime persists a new or updated child round representing the next question or completion state on the same trunk together with the source answer that led to it

#### Scenario: Explicit fork creates child round states
- **WHEN** the user explicitly materializes multiple shortlisted directions as branches
- **THEN** the runtime persists one child round lineage per selected direction, each with parent round identity, source-answer metadata, current branch message, and independently recoverable status

#### Scenario: Reload restores the same active round
- **WHEN** the browser reloads an existing session that already contains round lineage and explicit forks
- **THEN** the runtime restores the same active round context and visible tree relationships instead of collapsing the session back to a generic current-question view
