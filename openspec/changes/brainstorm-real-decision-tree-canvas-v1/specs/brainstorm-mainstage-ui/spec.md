## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active branch node the dominant visual focus of the mainstage by placing it inside the primary tree canvas rather than by separating it into an equal-weight central dashboard panel.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision appears as the dominant node within the tree canvas while any inspector or supporting surfaces remain visually secondary

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a secondary inspection surface while the active approval node remains the primary focus within the tree canvas

### Requirement: The browser mainstage SHALL not resolve into an equal-weight dashboard layout during active work
The browser brainstorming product SHALL keep the decision tree as the primary surface and MUST NOT present tree, form, and details as equal-weight sibling dashboard panels during active or completed sessions.

#### Scenario: Active session is rendered
- **WHEN** the workbench shows an in-progress session
- **THEN** the tree canvas remains visually primary and the supporting inspector/details do not occupy equivalent ownership of the mainstage

#### Scenario: Completed session is rendered
- **WHEN** the workbench shows a completed session
- **THEN** the finished result remains anchored to the tree canvas context rather than causing the UI to fall back into a dashboard of equal-weight panels

### Requirement: The browser mainstage SHALL keep the new-session entry secondary while a session is active
The browser brainstorming product SHALL keep the entry for starting another brainstorm available inside the workbench, but it MUST remain visually secondary to the active session and MUST NOT reclaim the mainstage while an in-progress or completed session is being viewed.

#### Scenario: In-progress session is active
- **WHEN** the user is viewing or answering the current active node
- **THEN** the new-session entry appears as a secondary dock or action surface rather than a hero panel that competes with the active tree canvas

#### Scenario: Completed session is active
- **WHEN** the user is reviewing a finished result inside the workbench
- **THEN** the new-session entry remains available for starting another topic without replacing the finished-result surface as the dominant content
