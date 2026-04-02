## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL keep the current active branch or mainline question as the dominant focus of the workbench mainstage, while the surrounding tree remains the navigation surface for understanding and switching between real branch paths.

#### Scenario: Mainline question is active
- **WHEN** the user is working on the current mainline question
- **THEN** the mainline node is the active focus and branch nodes remain secondary tree context

#### Scenario: Branch question is active
- **WHEN** the user selects a branch that has its own current question
- **THEN** that branch node becomes the active focus and the mainline becomes secondary context without losing visibility

### Requirement: The browser mainstage SHALL render the graph as a top-down decision tree
The browser brainstorming product SHALL render the decision graph as a top-down tree instead of a left-to-right flow, so users can read the topic root, descending mainline, and lateral branch alternatives in decision-tree form.

#### Scenario: Mainline path is rendered
- **WHEN** the workbench shows the topic root and current mainline path
- **THEN** the graph lays those nodes from top to bottom

#### Scenario: Multiple branches exist below one question
- **WHEN** a frozen question node has multiple child branches
- **THEN** those branch nodes render below that question as sibling children in the same tree layer

#### Scenario: User switches between focused and overview modes
- **WHEN** the user changes graph density mode
- **THEN** the graph keeps the same top-down tree direction and only adjusts spacing or visible context density
