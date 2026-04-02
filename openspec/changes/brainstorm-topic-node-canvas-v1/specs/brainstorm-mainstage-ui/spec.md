## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active node the dominant visual focus of the mainstage by embedding it inside the topic-rooted canvas rather than by separating it into a detached central question panel or any equal-weight dashboard column.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision appears as the dominant node within the canvas while inspector and supporting surfaces remain visually secondary

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a secondary inspection surface while the active approval node remains the primary focus inside the canvas

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present the finished session inside the same node canvas as a convergence-and-artifact completion cluster where the mature deliverable stays primary, while the root topic, explored path, and supporting package remain visible as secondary context.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the mainstage keeps the user in the same canvas and promotes the convergence/artifact nodes as the primary completion focus instead of switching to an isolated result page

#### Scenario: Supporting package is still available after completion
- **WHEN** the user views a completed session
- **THEN** the design spec, implementation plan, and result bundle remain visible as supporting context without replacing the convergence/artifact cluster as the primary focus

#### Scenario: User starts another brainstorm after completion
- **WHEN** the user wants to begin a new brainstorm while viewing a completed session
- **THEN** the fresh-topic entry path remains clearly available as a secondary workspace action without hiding or overwriting the completed result by default
