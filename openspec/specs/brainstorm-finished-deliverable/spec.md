# brainstorm-finished-deliverable Specification

## Purpose
Define the mature brainstorming output contract and the completion gate that determines when a session is truly done.

## Requirements
### Requirement: Brainstorm sessions must complete with a mature deliverable
The system MUST treat a brainstorming session as complete only after it has produced a mature deliverable derived from the user's seed, rather than a shallow recap of the last selected option.

#### Scenario: Session reaches completion without file output
- **WHEN** the backend decides the brainstorming work is complete and no artifact file is needed
- **THEN** it emits a `summary` that contains a mature brainstorming deliverable with problem framing, explored approaches, recommendation, rationale, risks or open questions, and next actions

#### Scenario: Session reaches completion with file output
- **WHEN** the backend decides the brainstorming work is complete and an artifact file is produced
- **THEN** the resulting `artifact_ready` state points to a mature brainstorming deliverable that contains problem framing, explored approaches, recommendation, rationale, risks or open questions, and next actions

### Requirement: Completion is gated by deliverable completeness rather than phase alone
The system MUST NOT mark a brainstorming session complete solely because it has reached an internal handoff phase; it MUST verify that the minimum finished-deliverable sections are present first.

#### Scenario: Internal handoff is reached too early
- **WHEN** the runtime reaches its handoff phase but the finished deliverable is missing required sections
- **THEN** the session remains in progress and the backend continues asking or synthesizing until the completion gate is satisfied

#### Scenario: Required sections are present
- **WHEN** the finished deliverable contains all required sections for completion
- **THEN** the backend may emit `summary` or `artifact_ready` and mark the session complete
