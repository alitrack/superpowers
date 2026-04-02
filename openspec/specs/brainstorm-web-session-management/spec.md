# brainstorm-web-session-management Specification

## Purpose
Define how browser-first brainstorming sessions are created, isolated, persisted, and resumed in the Web product.

## Requirements
### Requirement: Browser brainstorming sessions are isolated and resumable
The system MUST create a distinct backend session for each browser brainstorming flow so concurrent users do not share runtime state, and it MUST also persist real child branch sessions inside the same topic session without letting them overwrite each other.

#### Scenario: New session is created
- **WHEN** a browser user starts a new brainstorming session
- **THEN** the backend creates a unique session id, persists isolated runtime state plus processing metadata, and returns a resumable session record even if the first real-runtime step is still running in background

#### Scenario: Existing session is resumed
- **WHEN** a browser user reopens or resumes a prior session
- **THEN** the backend restores the session history, current message, completion state, and any in-flight processing status without replaying another user's answers

#### Scenario: In-flight session is reopened after service interruption
- **WHEN** a browser user reopens a session whose persisted state says a background turn is still running but no local worker is attached
- **THEN** the backend reattaches or re-enqueues that session work from persisted session state instead of leaving the session permanently stuck

#### Scenario: Mainline and branch sessions are both persisted
- **WHEN** a topic session contains the mainline plus one or more child branches
- **THEN** the backend persists each branch session's current state alongside the mainline so the tree can be restored after reload

#### Scenario: One branch advances
- **WHEN** a selected branch session continues to its next runtime turn
- **THEN** the persisted state of the mainline and untouched sibling branches remains unchanged

#### Scenario: Existing branch is reopened
- **WHEN** the user reopens a topic session with persisted branches
- **THEN** the backend restores the full tree, branch statuses, and active branch selection without recomputing the original branch anchors

### Requirement: Session history is persisted for browser retrieval
The system MUST persist normalized answer history, completion metadata, and background-processing state so the browser can render prior progress, understand whether a turn is still running, and reopen the correct session later.

#### Scenario: Answer is accepted
- **WHEN** the browser submits a valid normalized `answer`
- **THEN** the backend stores the pending answer payload and processing state before the background runtime turn advances the session

#### Scenario: Background turn completes
- **WHEN** a queued create or submit turn finishes successfully
- **THEN** the backend stores the updated history, current session state, and completion metadata before marking processing as idle

#### Scenario: Session list is requested
- **WHEN** the browser asks for recent or resumable sessions
- **THEN** the backend returns stable session identifiers plus enough metadata to distinguish idle, running, and failed sessions
