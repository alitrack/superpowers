## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time, and the host SHALL present that decision as the dominant mainstage element while limiting default visible history to lightweight recent context.

#### Scenario: Current active decision is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single decision as the dominant visual focus and does not give equal visual weight to unrelated panels

#### Scenario: Prior answers exist
- **WHEN** earlier steps have already been completed
- **THEN** the host may show recent supporting context for only the most recent `2-3` steps by default while keeping the current active decision primary

#### Scenario: Full history is requested
- **WHEN** the user explicitly asks to review the full prior thread
- **THEN** the host reveals the broader history without replacing the current mainstage focus unless the session is already complete
