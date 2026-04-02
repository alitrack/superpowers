## ADDED Requirements

### Requirement: Generated question nodes SHALL be persisted as immutable snapshots
The system MUST persist each generated brainstorming question as an immutable node snapshot at the moment it is first produced by the real Codex runtime, and later turns MUST append new nodes or edges instead of rewriting the original question node.

#### Scenario: First runtime question is created
- **WHEN** a new browser brainstorming session successfully receives its first real-runtime question
- **THEN** the backend persists a frozen question node snapshot containing that question's visible content and metadata

#### Scenario: Later answer advances the session
- **WHEN** the user answers a persisted question and the runtime returns the next question
- **THEN** the backend appends a new child node for the next question and does not mutate the original parent question snapshot

#### Scenario: Explicit fork creates branch questions
- **WHEN** a user explicitly forks multiple directions from an existing question
- **THEN** the backend appends one child question node per resulting branch and preserves the source question snapshot unchanged
