## MODIFIED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a topic-rooted node canvas where the root topic, current active decision, completed path steps, adjacent branch directions, convergence summaries, and finished artifact nodes are visible in one workspace instead of being split across a detached central question panel and auxiliary card lists.

#### Scenario: In-progress session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still waiting for input
- **THEN** it renders the topic root node, the completed path context, and exactly one active answerable node in the same canvas workspace without introducing a second formal question outside the canvas

#### Scenario: Completed session is shown in the canvas workspace
- **WHEN** the browser opens a completed session whose state is `summary` or `artifact_ready`
- **THEN** it renders the convergence and finished-result context as nodes in the same canvas while keeping the root topic and explored path visible as supporting context

### Requirement: Supporting canvas nodes SHALL remain inspectable without becoming concurrent answer surfaces
The browser brainstorming product SHALL allow users to inspect non-active canvas nodes such as prior path steps, branch directions, convergence summaries, and artifact nodes without turning them into concurrent answerable decisions, and any user-facing node actions MUST remain constrained by node kind.

#### Scenario: User inspects a supporting node
- **WHEN** the user selects a non-active node
- **THEN** the browser shows its details and any valid product actions in a contextual inspection surface while keeping the current active node as the only formal input target

#### Scenario: User inspects the completed result from the canvas
- **WHEN** the current session contains a convergence or artifact node
- **THEN** the browser lets the user inspect or export that result from the canvas context without replacing the active-session rule that only one formal node may accept an answer at a time

## ADDED Requirements

### Requirement: Meaningful canvas nodes SHALL expose product-facing continuation semantics
The browser brainstorming product SHALL use node kinds to communicate what can happen next, so the canvas is understood as a working thinking surface rather than as static decoration.

#### Scenario: Active node is selected
- **WHEN** the user selects the current active node
- **THEN** the canvas presents the formal answer controls and any active-step guidance inside that node rather than in a detached form panel

#### Scenario: Convergence or artifact node is selected
- **WHEN** the user selects a convergence or artifact node
- **THEN** the canvas and inspector explain the result, its source context, and the next available user-facing actions such as viewing, exporting, or starting another topic from the completed work
