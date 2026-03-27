## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and the real Codex-backed path MUST bootstrap that sequencing from the required repository skills before the first user-facing response.

#### Scenario: Real seeded session starts
- **WHEN** a real Codex-backed structured brainstorming session is initialized with a user seed
- **THEN** the runtime first loads the required repository skills and only then emits the first `question`, `summary`, or `artifact_ready` message

#### Scenario: Skill bootstrap requires repo access
- **WHEN** the real runtime needs to load the required repository skills
- **THEN** its base instructions allow reading those specific repository files without opening unrelated repo inspection by default

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime continues deciding whether to emit the next `question`, a `summary`, or an `artifact_ready` message while staying grounded in the loaded skills and existing browser contract
