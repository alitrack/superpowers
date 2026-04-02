## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable round at a time, and the host SHALL present that round as the dominant active node inside a workbench where each formal backend question maps to one round node on the tree; option sets belong inside the active round node and MUST NOT become separate peer nodes on the visible graph.

#### Scenario: Current active round is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single round as the dominant active node and highlights its place in the current trunk or selected branch lineage

#### Scenario: Prior rounds exist
- **WHEN** earlier steps have already been completed
- **THEN** the host shows the answered round path as prior round nodes while keeping the current active round as the only input target by default

#### Scenario: Explicit fork exists
- **WHEN** the user has explicitly created branch paths from a round
- **THEN** the host shows those child branches as child round nodes while still allowing only one currently selected round to accept input at a time
