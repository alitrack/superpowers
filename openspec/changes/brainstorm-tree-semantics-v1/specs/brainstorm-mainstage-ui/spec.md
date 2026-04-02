## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep one active answerable context
The browser brainstorming product SHALL keep exactly one answerable context on the mainstage at a time, and that context SHALL be either the active mainline decision or the currently selected branch run.

#### Scenario: Mainline decision is active
- **WHEN** the session is still on the mainline and no branch run is selected
- **THEN** the answer surface is bound to the active decision node and all other nodes remain inspectable only

#### Scenario: Branch run is selected
- **WHEN** the user selects a branch-run node from the tree
- **THEN** the mainstage switches the answer surface to that branch run while leaving sibling branches and the mainline visible but non-answerable

## ADDED Requirements

### Requirement: Tree selection SHALL drive branch context
The browser brainstorming mainstage SHALL let the user switch the active branch context from the tree itself instead of forcing branch navigation through external panels or hidden session lists.

#### Scenario: User selects another branch from the tree
- **WHEN** the user clicks or selects a materialized branch-run node
- **THEN** the browser updates the active context, focused view, and inspector to that branch run without discarding the rest of the visible tree
