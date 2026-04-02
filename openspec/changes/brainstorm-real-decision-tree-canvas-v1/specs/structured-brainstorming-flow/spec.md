## MODIFIED Requirements

### Requirement: Hosts present one active answerable question at a time
The system MUST expose exactly one active answerable user decision at a time, and the host SHALL present that decision as the dominant active node inside the tree canvas while also exposing its surrounding branch path and adjacent context without turning them into competing answerable questions.

#### Scenario: Current active decision is visible
- **WHEN** a session is waiting for the user to answer a question or approval prompt
- **THEN** the host renders that single decision as the dominant active node and highlights its position within the surrounding branch path

#### Scenario: Prior answers exist
- **WHEN** earlier steps have already been completed
- **THEN** the host may show the current path, checkpoint markers, and lightweight nearby branches by default while keeping the current active decision primary

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer, approval surface, and artifact viewer rather than a workflow engine, and the host SHALL make that waiting state visible to the user instead of appearing inert after submission.

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message, visibly enters an in-progress state, and does not decide the next question locally

#### Scenario: Backend request fails while waiting
- **WHEN** the host cannot obtain the next backend message after a create or submit action
- **THEN** the host presents a visible failure state together with a restorable user action instead of silently stalling
