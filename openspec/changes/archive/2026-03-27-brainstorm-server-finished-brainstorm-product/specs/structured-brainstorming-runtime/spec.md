## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and the real Codex-backed path MUST continue the session until the finished-deliverable completion gate is satisfied rather than stopping at the first lightweight handoff.

#### Scenario: Session starts from a user seed
- **WHEN** a structured brainstorming session is initialized from a user-provided seed
- **THEN** the backend runtime owns both question sequencing and finished-deliverable completion logic

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime decides whether to emit another `question`, continue internal synthesis, or produce a completed deliverable only after the completion gate is satisfied

#### Scenario: Handoff phase is reached before the deliverable is mature
- **WHEN** the runtime has enough state to enter handoff but the finished deliverable is still incomplete
- **THEN** it does not emit final completion and instead continues the session toward a mature deliverable
