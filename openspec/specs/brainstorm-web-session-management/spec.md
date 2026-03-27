# brainstorm-web-session-management Specification

## Purpose
Define how browser-first brainstorming sessions are created, isolated, persisted, and resumed in the Web product.

## Requirements
### Requirement: Browser brainstorming sessions are isolated and resumable
The system MUST create a distinct backend session for each browser brainstorming flow so concurrent users do not share runtime state and a user can resume an in-progress session.

#### Scenario: New session is created
- **WHEN** a browser user starts a new brainstorming session
- **THEN** the backend creates a unique session id, initializes isolated runtime state, and returns the first active `question`

#### Scenario: Existing session is resumed
- **WHEN** a browser user reopens or resumes a prior session
- **THEN** the backend restores the session history, current message, and completion state without replaying another user's answers

### Requirement: Session history is persisted for browser retrieval
The system MUST persist normalized answer history and completion metadata so the browser can render prior progress and recent sessions.

#### Scenario: Answer is accepted
- **WHEN** the browser submits a valid normalized `answer`
- **THEN** the backend stores the updated history and current session state before returning the next message

#### Scenario: Session list is requested
- **WHEN** the browser asks for recent or resumable sessions
- **THEN** the backend returns stable session identifiers and enough metadata to reopen the correct session
