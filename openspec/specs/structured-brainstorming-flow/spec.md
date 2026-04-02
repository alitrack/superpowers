# structured-brainstorming-flow Specification

## Purpose
TBD - created by archiving change structured-brainstorming. Update Purpose after archive.
## Requirements
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

### Requirement: Backend controls question sequencing and branching
The system SHALL let the backend decide which user-facing question, hidden automation step, review checkpoint, or completion state comes next so workflow behavior stays consistent across hosts and is not hardcoded into individual renderers.

#### Scenario: Answer is submitted
- **WHEN** the host sends a normalized `answer` message
- **THEN** the backend decides whether to emit the next `question`, enter hidden workflow automation, emit a review checkpoint, or emit the final completion bundle

#### Scenario: Multiple hosts implement the same flow
- **WHEN** browser and terminal hosts use the same backend
- **THEN** they follow the same workflow path for the same sequence of normalized answers and approvals

### Requirement: Hosts wait for the next backend message after submission
The system MUST treat the host as a renderer, approval surface, and artifact viewer rather than a workflow engine.

#### Scenario: User submits an answer
- **WHEN** an answer is accepted by the host
- **THEN** the host waits for the next backend message instead of deciding the next question locally

#### Scenario: Hidden workflow step is running
- **WHEN** the backend enters an internal automation step such as draft writing or review
- **THEN** the host shows the current workflow stage and does not synthesize its own local next question or draft content

### Requirement: Flow completion produces a structured handoff to implementation or artifact review
The system MUST conclude V1 with a structured completion state that exposes a reviewable design spec and implementation plan rather than only a lightweight brainstorming recap.

#### Scenario: First-phase workflow completes
- **WHEN** the workflow has completed design approval, spec review, user spec review, and plan generation
- **THEN** the backend emits a completion state that exposes the final `spec + plan` bundle

#### Scenario: Workflow blocks before completion
- **WHEN** the backend cannot complete the internal workflow automatically
- **THEN** the host presents the current reviewable state together with one active request for user guidance

### Requirement: Hosts present workflow progress in non-technical language
The system MUST present workflow stage and checkpoint progress inside the host workbench using user-facing labels and actions rather than requiring users to understand git, skills, subagents, or internal reviewer terminology.

#### Scenario: Internal automation is active
- **WHEN** the workflow is running a hidden internal step
- **THEN** the host shows the current stage in user-facing language such as drafting, checking, or preparing the next result within the workbench stage context

#### Scenario: Completion state is shown
- **WHEN** the host presents the final `spec + plan` bundle and finished result
- **THEN** it describes the completion state and supporting package in user-facing terms inside the workbench rather than engineering workflow jargon

### Requirement: Formal questions SHALL become stable historical nodes
The system MUST treat each generated formal question as a stable historical node once shown to the user, so later branching and review can rely on that node as a fixed ancestor rather than a mutable projection of current session state.

#### Scenario: User revisits an earlier question node
- **WHEN** the host reloads or inspects a previously generated question node
- **THEN** the visible title, description, and options for that node remain the same as when it was first generated

#### Scenario: Branch starts from an earlier question node
- **WHEN** the user explicitly forks from a question that has already been shown
- **THEN** the system appends new child branch paths from that frozen question snapshot and preserves the parent question node exactly as originally generated

#### Scenario: Mainline later advances past the same question
- **WHEN** the mainline continues after a frozen question has already been used as a branch anchor
- **THEN** the original question node remains unchanged and both the mainline continuation and any new branch sessions continue as separate descendants of that same node
