## MODIFIED Requirements

### Requirement: Structured brainstorming messages use a shared transport contract
The system MUST represent structured brainstorming interactions through a shared transport contract so browser, terminal, and GUI hosts can exchange the same message shapes for questions, answers, summaries, artifact completion, and workflow-related review states.

#### Scenario: Backend emits a question
- **WHEN** the backend needs user input during a structured brainstorming session
- **THEN** it emits a `question` message with a stable `questionId`, a supported `questionType`, and any workflow metadata required by the host to present the current stage

#### Scenario: Host receives a completion message
- **WHEN** the backend determines that the V1 workflow is complete
- **THEN** it emits a completion message using the shared transport contract together with enough workflow metadata and artifact references for the host to render the final `spec + plan` state

### Requirement: Question payloads declare the supported interaction types
The system SHALL support `pick_one`, `pick_many`, `confirm`, and `ask_text` as the only valid structured brainstorming question types for both discovery prompts and approval checkpoints.

#### Scenario: Structured choice question is emitted
- **WHEN** the backend emits a `pick_one` or `pick_many` question
- **THEN** the question payload includes an `options` array with stable option identifiers and user-visible labels

#### Scenario: Approval prompt is emitted
- **WHEN** the backend needs design or spec approval from the user
- **THEN** it expresses that approval prompt using the existing structured question types instead of inventing a host-local approval mechanism

### Requirement: Answer payloads are normalized before downstream branching
The system MUST normalize user input into a standard `answer` message so downstream branching, approval handling, and completion generation can work without host-specific parsing.

#### Scenario: User answers with a structured selection
- **WHEN** the user selects one or more provided options
- **THEN** the emitted `answer` message uses the appropriate normalized `answerMode` and `optionIds`

#### Scenario: User approves or rejects a draft
- **WHEN** the user responds to a review checkpoint
- **THEN** the emitted `answer` message preserves that approval decision in the same normalized contract used for ordinary structured questions

### Requirement: Completion messages preserve the converged path
The system MUST include enough structured information in completion messages for a host or backend to reconstruct the selected path, the review checkpoints, and the final `spec + plan` outputs without re-parsing raw user text.

#### Scenario: Summary is emitted
- **WHEN** the backend emits a `summary` during an in-progress review or completion step
- **THEN** the payload includes the converged path, the normalized answers, and the current reviewable workflow state

#### Scenario: Artifact readiness is emitted
- **WHEN** the backend has produced the final V1 artifacts
- **THEN** the `artifact_ready` payload includes enough linked state for the host to load the final design spec and implementation plan bundle

## ADDED Requirements

### Requirement: User-facing prompts avoid engineering workflow jargon by default
The system MUST phrase default user-facing prompts and stage labels without requiring knowledge of git, subagents, skills, or internal workflow names.

#### Scenario: Internal review completes
- **WHEN** the backend is ready for the user to review a draft or plan
- **THEN** the prompt asks the user to review the result in user-facing language instead of mentioning spec-review loops or reviewer agents

#### Scenario: Hidden checkpoint is created
- **WHEN** the backend persists an internal checkpoint
- **THEN** the default user-facing message does not mention commits, branches, or other version-control terms unless a developer-facing inspection surface is explicitly requested
