## MODIFIED Requirements

### Requirement: Completion messages preserve the converged path
The system MUST include enough structured information in completion messages for a host or backend to reconstruct the selected path, the explored alternatives, and the finished brainstorming deliverable without re-parsing raw user text.

#### Scenario: Summary is emitted
- **WHEN** the backend emits a `summary`
- **THEN** the payload includes the mature brainstorming deliverable content together with the normalized answers for the completed session

#### Scenario: Artifact readiness is emitted
- **WHEN** the backend has produced a concrete output file
- **THEN** the `artifact_ready` payload includes the artifact type, title, location, a short user-facing description, and enough linked state for the host to load the mature brainstorming deliverable
