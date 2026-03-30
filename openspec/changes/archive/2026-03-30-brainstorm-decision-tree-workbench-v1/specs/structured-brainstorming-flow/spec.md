## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time, and the host SHALL present that decision as the dominant active node inside a workbench that also exposes the surrounding branch path, checkpoints, and nearby context without turning them into competing answerable questions.

#### Scenario: Current active decision is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single decision as the dominant active node and highlights its position within the surrounding branch path

#### Scenario: Prior answers exist
- **WHEN** earlier steps have already been completed
- **THEN** the host may show the current path, checkpoint markers, and only lightweight nearby context by default while keeping the current active decision primary

#### Scenario: Full history is requested
- **WHEN** the user explicitly asks to review the full prior thread
- **THEN** the host reveals the broader branch structure through the workbench without replacing the current active-node focus unless the session is already complete

### Requirement: Hosts present workflow progress in non-technical language
The system MUST present workflow stage and checkpoint progress inside the host workbench using user-facing labels and actions rather than requiring users to understand git, skills, subagents, or internal reviewer terminology.

#### Scenario: Internal automation is active
- **WHEN** the workflow is running a hidden internal step
- **THEN** the host shows the current stage in user-facing language such as drafting, checking, or preparing the next result within the workbench stage context

#### Scenario: Completion state is shown
- **WHEN** the host presents the final `spec + plan` bundle and finished result
- **THEN** it describes the completion state and supporting package in user-facing terms inside the workbench rather than engineering workflow jargon
