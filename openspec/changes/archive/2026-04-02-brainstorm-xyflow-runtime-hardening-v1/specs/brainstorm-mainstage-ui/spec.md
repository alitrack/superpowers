## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active node the dominant visual focus of the mainstage by centering it inside the graph workspace with visible incoming and outgoing edges instead of treating it as a detached central card or a visually ambiguous pseudo-tree element.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision appears as the dominant graph node while surrounding path and branch context remain secondary but connected

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft remains secondary context while the active approval node stays primary inside the graph

### Requirement: The browser mainstage SHALL use a graph-native completion cluster for finished results
The browser brainstorming product SHALL present finished sessions as a graph-native completion cluster anchored to the explored path, where the convergence result and final artifact remain part of the same mainstage graph instead of becoming a detached result page or inspector-only panel.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the mainstage focuses the user on the convergence-and-artifact cluster while keeping the root topic and explored path visible in the same graph

#### Scenario: Supporting package is still available after completion
- **WHEN** the user views a completed session
- **THEN** the supporting package remains available as secondary context without replacing the graph-native completion cluster as the primary focus
