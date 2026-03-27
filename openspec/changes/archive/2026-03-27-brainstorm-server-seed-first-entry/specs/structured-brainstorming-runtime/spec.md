## MODIFIED Requirements

### Requirement: Structured brainstorming runtime owns active-question sequencing
The system MUST run structured brainstorming question sequencing in a backend-side runtime so hosts do not decide what question comes next, and that runtime MUST initialize from the session seed when one is available rather than always starting with a generic intake question.

#### Scenario: Seeded session starts
- **WHEN** a structured brainstorming session is initialized with an initial user prompt
- **THEN** the backend runtime emits the first formal `question`, `summary`, or `artifact_ready` message based on that seed instead of asking again what the user wants to brainstorm about

#### Scenario: Unseeded compatibility session starts
- **WHEN** a structured brainstorming session is initialized without an initial user prompt
- **THEN** the backend runtime may use the compatibility intake path to identify the topic before continuing

#### Scenario: Normalized answer is received
- **WHEN** the host submits a normalized `answer` message
- **THEN** the backend runtime updates the session's facilitation state and decides whether to emit the next `question`, a `summary`, or an `artifact_ready` message

### Requirement: Browser structured host behaves as a renderer-only client
The browser structured brainstorming host MUST render backend-provided messages and submit normalized answers without embedding its own branching tree, while owning only the pre-session seed capture needed to start the runtime with the correct topic.

#### Scenario: Host receives a question
- **WHEN** the browser host receives a backend-provided `question`
- **THEN** it renders that question as the single active answerable prompt and does not derive an alternate next question locally

#### Scenario: Host submits an answer
- **WHEN** the browser host accepts the user's submission
- **THEN** it emits a normalized `answer` payload and waits for the next backend message before rendering another active question

#### Scenario: Host creates a seeded session
- **WHEN** the browser host sends the initial brainstorming prompt at session creation time
- **THEN** it does not also invent a separate local first question for the runtime to answer

### Requirement: Local demo runtime remains contract-compatible
The in-repo brainstorm server MUST exercise the same transport contract used by future structured brainstorming hosts even as the session-start protocol becomes seed-aware.

#### Scenario: Seeded demo flow advances
- **WHEN** the local runtime processes a seeded browser-created session
- **THEN** the first outbound message still conforms to the existing `question`, `summary`, or `artifact_ready` transport contract

#### Scenario: Provider-backed runtime advances
- **WHEN** the real Codex-backed runtime processes a seeded browser-created session
- **THEN** the first outbound message also conforms to the same `question`, `summary`, or `artifact_ready` transport contract
