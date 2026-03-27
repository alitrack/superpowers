# brainstorm-automation-boundaries Specification

## Purpose
Define which actions are automatic and hidden vs which require explicit user confirmation.

## Requirements
### Requirement: Internal engineering workflow mechanics stay hidden in the default UI
The system MUST keep skills, subagents, reviewer loops, git-backed checkpoints, and similar engineering mechanisms out of the default user-facing brainstorming experience.

#### Scenario: Internal automation runs during a session
- **WHEN** the backend reads skills, dispatches reviewers, creates checkpoints, or writes intermediate artifacts
- **THEN** the default UI does not require the user to understand or acknowledge those engineering steps

#### Scenario: Developer inspection is requested
- **WHEN** a developer or test harness inspects the session
- **THEN** the system can expose the hidden internal workflow details through a separate inspection surface without polluting the default UI

### Requirement: User confirmation is reserved for meaningful product decisions and external side effects
The system MUST ask the user for confirmation only when the action changes the intended deliverable, changes the agreed design direction, or affects systems outside the local workflow.

#### Scenario: Deliverable shape would change
- **WHEN** the system needs to change the output type, the agreed completion scope, or the user-visible deliverable bundle
- **THEN** it asks the user for confirmation before continuing

#### Scenario: External side effect would occur
- **WHEN** the system wants to push, publish, or otherwise modify a remote or external system
- **THEN** it asks the user for explicit confirmation before executing that action

### Requirement: Local checkpointing degrades gracefully without surfacing git jargon
The system MUST preserve recoverable local workflow checkpoints regardless of whether the workspace is backed by git, while keeping version-control terminology out of the default user experience.

#### Scenario: Git-backed workspace is available
- **WHEN** local git is available and safe to use
- **THEN** the system may create hidden git-backed checkpoints without requiring the user to manage commits or branches

#### Scenario: Workspace is not backed by git
- **WHEN** git is unavailable or unsuitable for the current workspace
- **THEN** the system still preserves recoverable local checkpoints through a non-git fallback and continues the workflow without surfacing git as a prerequisite
