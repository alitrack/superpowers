## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL keep the current active branch node and visible graph path as the dominant focus of the workbench mainstage, while workflow stage, request status, and view controls remain secondary shell chrome that MUST NOT compete with the graph for ownership of the screen.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the primary workbench stage while workflow stage and request status stay in secondary shell surfaces

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a contextual inspector surface while the single active approval decision remains the primary focus in the graph

#### Scenario: User changes graph view mode
- **WHEN** the user switches between focused and overview graph views
- **THEN** the control appears as lightweight graph-header chrome instead of a separate workflow panel above the canvas

### Requirement: The browser mainstage SHALL show only lightweight recent context by default
The browser brainstorming product SHALL show only the current branch path, the most recent `2-3` supporting nodes, and lightweight shell state by default, while allowing the user to expand into broader session history on demand.

#### Scenario: Prior steps exist
- **WHEN** the current session already contains multiple completed steps
- **THEN** the default workbench shows the current path and only lightweight nearby context instead of expanding the full branch history automatically

#### Scenario: User wants deeper history
- **WHEN** the user explicitly requests more context
- **THEN** the product reveals fuller session history and branch structure through the workbench without replacing the mainstage focus on the current active node

#### Scenario: Earlier history is collapsed
- **WHEN** older path nodes are hidden from the default graph view
- **THEN** the visible graph reconnects the topic root to the first visible node instead of leaving a broken or orphaned edge

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present a completed session inside the same workbench as an outcome-first result surface where the runtime's mature deliverable stays primary, while the branch path and any actual supporting package remain secondary context.

#### Scenario: Conversation-mode session reaches completion
- **WHEN** a non-full-skill session finishes with a mature deliverable
- **THEN** the workbench shows the finished runtime result without inventing spec/plan package chrome

#### Scenario: Full-skill session reaches completion
- **WHEN** an explicit full-skill workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the workbench switches its active stage into a finished-result presentation while keeping the branch path and the actual supporting package visible as secondary context

#### Scenario: Supporting package is absent
- **WHEN** the completed session did not generate spec, plan, or bundle artifacts
- **THEN** the workbench does not reserve visual space for those absent workflow assets
