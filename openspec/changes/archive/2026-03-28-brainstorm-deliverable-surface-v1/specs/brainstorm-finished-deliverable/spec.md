## MODIFIED Requirements

### Requirement: Brainstorm sessions must complete with a mature deliverable
The system MUST treat a brainstorming session as complete only after it has produced a mature deliverable derived from the user's seed, and the completion payload MUST expose that deliverable in a normalized structure that a browser result surface and result exports can use directly.

#### Scenario: Session reaches completion without file output
- **WHEN** the backend decides the brainstorming work is complete and no artifact file is needed
- **THEN** it emits a `summary` that contains a mature brainstorming deliverable with problem framing, explored approaches, recommendation, rationale, risks or open questions, and next actions in normalized structured fields

#### Scenario: Session reaches completion with file output
- **WHEN** the backend decides the brainstorming work is complete and an artifact file is produced
- **THEN** the resulting `artifact_ready` state includes the mature brainstorming deliverable in normalized structured fields alongside any supporting artifact metadata needed to open generated files
