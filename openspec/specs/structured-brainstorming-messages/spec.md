# structured-brainstorming-messages Specification

## Purpose
TBD - created by archiving change structured-brainstorming. Update Purpose after archive.
## Requirements
### Requirement: Structured brainstorming messages use a shared transport contract
The system MUST represent structured brainstorming interactions through a shared message contract so browser, terminal, and GUI hosts can exchange the same message shapes for questions, answers, summaries, and artifact completion.

#### Scenario: Backend emits a question
- **WHEN** the backend needs user input during a structured brainstorming session
- **THEN** it emits a `question` message with a stable `questionId`, a supported `questionType`, and all fields required by the contract

#### Scenario: Host receives a completion message
- **WHEN** the backend determines that questioning is complete
- **THEN** it emits either a `summary` message or an `artifact_ready` message using the same transport contract

### Requirement: Question payloads declare the supported interaction types
The system SHALL support `pick_one`, `pick_many`, `confirm`, and `ask_text` as the only valid structured brainstorming question types.

#### Scenario: Structured choice question is emitted
- **WHEN** the backend emits a `pick_one` or `pick_many` question
- **THEN** the question payload includes an `options` array with stable option identifiers and user-visible labels

#### Scenario: Free-text question is emitted
- **WHEN** the backend emits an `ask_text` question
- **THEN** the question payload omits structured options and still provides the formal question title and description

### Requirement: Answer payloads are normalized before downstream branching
The system MUST normalize user input into a standard `answer` message so downstream branching and summary generation can work without host-specific parsing.

#### Scenario: User answers with a structured selection
- **WHEN** the user selects one or more provided options
- **THEN** the emitted `answer` message uses the appropriate normalized `answerMode` and `optionIds`

#### Scenario: User answers with custom text
- **WHEN** the user types an answer that does not resolve to a structured option
- **THEN** the emitted `answer` message preserves the free text and marks it with the correct text-capable `answerMode`

### Requirement: Completion messages preserve the converged path
The system MUST include enough structured information in completion messages for a host or backend to reconstruct the selected path without re-parsing raw user text.

#### Scenario: Summary is emitted
- **WHEN** the backend emits a `summary`
- **THEN** the payload includes the converged path and the normalized answers for each completed question

#### Scenario: Artifact readiness is emitted
- **WHEN** the backend has produced a concrete output file
- **THEN** the `artifact_ready` payload includes the artifact type, title, location, and a short user-facing description

