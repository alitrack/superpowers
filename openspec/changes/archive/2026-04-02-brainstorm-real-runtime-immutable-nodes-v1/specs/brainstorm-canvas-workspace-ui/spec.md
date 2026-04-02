## MODIFIED Requirements

### Requirement: The decision tree SHALL be derived from existing session state without a new persistent tree schema
The browser brainstorming product SHALL derive its visible decision-tree workbench from the session's persisted immutable node history, and the browser MUST treat that node history as the authoritative source of previously generated questions rather than reconstructing historical nodes from mutable current session projections.

#### Scenario: Historical question is reloaded
- **WHEN** the browser opens or reloads a session that already contains generated question nodes
- **THEN** it renders those historical nodes from the persisted immutable node history rather than re-synthesizing them from only `currentMessage`, transient option state, or mutable branch projections

#### Scenario: Explicit branch tree is shown
- **WHEN** the session contains branch nodes appended from an earlier question
- **THEN** the canvas renders those branch nodes as descendants of the preserved source question node without modifying the original node snapshot
