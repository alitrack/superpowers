## ADDED Requirements

### Requirement: Historical question rounds SHALL preserve the original question snapshot
The browser brainstorming product SHALL render previously generated question rounds from their stored question snapshot so a submitted round keeps the same question-card structure after later rounds are appended.

#### Scenario: Mainline question is no longer active
- **WHEN** the user submits the current mainline question and the runtime appends a new child question
- **THEN** the prior mainline round remains visible with its original question title, description, and option structure instead of collapsing into an answer-summary-only card

#### Scenario: Branch question is not the active input target
- **WHEN** a branch question exists in the tree but another node is currently active
- **THEN** the branch round remains visible from its stored question snapshot while staying non-answerable until the user explicitly activates that branch

## MODIFIED Requirements

### Requirement: The browser mainstage SHALL keep the current active decision as the dominant focus
The browser brainstorming product SHALL make the current active branch node the dominant visual focus of the workbench mainstage instead of giving equal weight to the surrounding tree, stage strip, or context panels, while preserving historical question rounds as frozen supporting snapshots rather than rewriting them into summary cards.

#### Scenario: In-progress session is shown
- **WHEN** the user opens a brainstorming session that is still waiting for input
- **THEN** the current active question or approval decision occupies the primary workbench stage while the surrounding tree and context panels remain visually secondary

#### Scenario: Review checkpoint is shown
- **WHEN** the session reaches a design or spec review checkpoint
- **THEN** the draft may be shown in a contextual workbench panel while the single active approval decision remains the primary focus
