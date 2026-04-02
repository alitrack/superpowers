## MODIFIED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a real node-and-edge canvas rendered through a graph engine so the root topic, completed path steps, active node, branch directions, convergence result, and artifact result are visible as connected graph elements rather than as pseudo-tree columns or supporting card groups.

#### Scenario: In-progress session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still waiting for input
- **THEN** it renders the topic root, visible path, current active node, and branch context as connected nodes and edges in the same graph workspace

#### Scenario: Completed session is shown in the canvas workspace
- **WHEN** the browser opens a completed session whose state is `summary` or `artifact_ready`
- **THEN** it renders the convergence result and any finished artifact as graph nodes connected to the explored path instead of moving the result into a detached side panel

## ADDED Requirements

### Requirement: The browser canvas SHALL support custom node types for brainstorming stages
The browser brainstorming product SHALL use distinct graph node types for topic, completed step, active question, branch direction, convergence, and artifact result so each stage of the brainstorming flow remains visually understandable.

#### Scenario: Active question node is rendered
- **WHEN** the current session message is a `question`
- **THEN** the browser renders that step inside an active-question graph node that contains the formal answer controls

#### Scenario: Artifact-ready completion is rendered
- **WHEN** the current session message is `artifact_ready`
- **THEN** the browser renders a convergence node and an artifact node with a visible edge between them inside the same graph workspace
