## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and Codex-backed sessions MUST derive that questioning strategy from the current brainstorming skill guidance plus the session seed.

#### Scenario: Seeded Codex-backed session starts
- **WHEN** a structured brainstorming session is initialized with an initial user prompt on a Codex-backed runtime
- **THEN** the backend runtime emits the first formal `question`, `summary`, or `artifact_ready` message based on both the seed and current brainstorming skill guidance

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime updates the session's facilitation state and decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message using the skill-backed policy

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST exercise the same transport contract used by future structured brainstorming hosts even when the real Codex-backed path is skill-backed.

#### Scenario: Real Codex-backed runtime advances
- **WHEN** the real Codex-backed runtime processes a seeded browser-created session
- **THEN** the next outbound message conforms to the existing `question`, `summary`, or `artifact_ready` transport contract

#### Scenario: Fake fallback runtime advances
- **WHEN** the local fake runtime processes the same contract flow for tests
- **THEN** it remains contract-compatible without claiming to be the full skill-backed production path
