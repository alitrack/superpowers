## ADDED Requirements

### Requirement: Structured questions allow text override
The system MUST allow users to answer structured brainstorming questions with free text even when the primary UI presents selectable options.

#### Scenario: User rejects provided options
- **WHEN** the user types an answer that does not match any provided option
- **THEN** the system accepts the text input as a valid answer instead of forcing an option selection

#### Scenario: Host renders a structured choice question
- **WHEN** a host displays `pick_one`, `pick_many`, or `confirm`
- **THEN** the interaction surface indicates that typed input can be used as an alternative answer path

### Requirement: Simple text forms normalize to structured selections when unambiguous
The system SHALL normalize obvious text equivalents into structured answers so users can reply naturally without losing the benefits of structured branching.

#### Scenario: Numeric or alphabetical shorthand is provided
- **WHEN** the user responds with shorthand like `1`, `2`, `A`, or `B`
- **THEN** the system resolves the shorthand to the matching option identifier when the mapping is unambiguous

#### Scenario: Option label is typed directly
- **WHEN** the user types the visible label of a single option
- **THEN** the system normalizes the input to the corresponding structured option answer

### Requirement: Ambiguous text is resolved through confirmation rather than silent guessing
The system MUST avoid silently choosing between multiple plausible interpretations of a text answer.

#### Scenario: Text partially matches multiple options
- **WHEN** the system cannot uniquely resolve the text to one structured answer
- **THEN** it asks a short `confirm` follow-up before committing the branch

#### Scenario: Text includes both a likely option and additional nuance
- **WHEN** the user provides an answer such as a selection plus explanatory text
- **THEN** the system records a mixed answer form rather than discarding the extra nuance

### Requirement: Custom text answers preserve provenance for later reasoning
The system SHALL preserve the original text answer in normalized output so later branching, summaries, and artifact generation can use the user's real wording.

#### Scenario: Backend receives a custom text answer
- **WHEN** the normalized answer mode is text-capable
- **THEN** the original user text is retained in the answer payload passed to downstream logic

#### Scenario: Summary includes a custom answer path
- **WHEN** the session converges after one or more custom text answers
- **THEN** the completion payload reflects that chosen path without pretending the answer came from a predefined option set
