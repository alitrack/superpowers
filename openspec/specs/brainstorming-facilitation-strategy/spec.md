# brainstorming-facilitation-strategy Specification

## Purpose
Define the backend phase model for brainstorming sessions, including scoping, reframing, divergence, convergence, and handoff.

## Requirements
### Requirement: Brainstorming sessions use explicit facilitation phases
The system MUST track each brainstorming session through explicit facilitation phases so the backend can decide what kind of thinking work should happen next instead of asking a generic intake questionnaire.

#### Scenario: Session starts in scoping mode
- **WHEN** a new brainstorming session is created
- **THEN** the backend initializes a facilitation state that begins in a scoping-oriented phase rather than assuming a fixed field-collection sequence

#### Scenario: Session advances between phases
- **WHEN** the backend determines that the current learning goal has been satisfied
- **THEN** it updates the facilitation phase to the next appropriate stage such as reframing, divergence, convergence, or handoff

### Requirement: Each question is chosen to reduce the most important current uncertainty
The system MUST choose the next structured question based on the session's highest-value unresolved learning goal rather than a hardcoded list of standard fields.

#### Scenario: A key uncertainty is identified
- **WHEN** the backend has enough session context to identify the most important open uncertainty
- **THEN** it emits a question that is explicitly aimed at reducing that uncertainty

#### Scenario: A generic field would add less value
- **WHEN** a generic intake field is available but another unanswered issue would change the direction more materially
- **THEN** the backend asks about the higher-information-gain issue first

### Requirement: The backend preserves facilitation state across resume
The system MUST persist enough facilitation state to resume the same brainstorming process after reload instead of collapsing back to a fresh generic questionnaire.

#### Scenario: Browser session reloads mid-brainstorm
- **WHEN** an existing brainstorming session is reopened while still in progress
- **THEN** the backend restores the saved facilitation phase, current learning goal, and active decision context before producing another message

#### Scenario: Exec fallback session is resumed
- **WHEN** a session using exec fallback continues after reload
- **THEN** the facilitation state is reconstructed from persisted strategy data as well as transcript history
