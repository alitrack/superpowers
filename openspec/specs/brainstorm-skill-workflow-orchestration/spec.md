# brainstorm-skill-workflow-orchestration Specification

## Purpose
Define backend orchestration of the full brainstorming skill workflow through spec writing, review, user approval, and plan generation.
## Requirements
### Requirement: Browser brainstorming sessions execute the full skill workflow through plan completion
The system MUST allow a browser-first brainstorming session to run either the normal runtime-driven conversation flow or the explicit `full_skill` workflow, and the browser host MUST NOT force `full_skill` unless the caller explicitly requests it.

#### Scenario: Session starts with default browser settings
- **WHEN** a user starts a brainstorming session in the browser product without explicitly setting a workflow mode
- **THEN** the backend initializes using the server default workflow mode instead of being forced into `full_skill`

#### Scenario: Session starts in explicit full workflow mode
- **WHEN** an API caller or future advanced entry point explicitly requests `workflowMode: full_skill`
- **THEN** the backend initializes the full workflow rather than stopping at a conversation-only summary path

#### Scenario: Default browser session reaches completion
- **WHEN** the runtime-driven conversation gathers enough information to complete
- **THEN** the browser host stops at the runtime's `summary` or `artifact_ready` result instead of automatically continuing into spec writing and plan generation

### Requirement: V1 completion produces a reviewable spec-and-plan bundle
The system MUST treat a brainstorming session as producing a reviewable `spec + plan` bundle only when that session explicitly ran in `full_skill` workflow mode.

#### Scenario: Explicit full-skill workflow completes successfully
- **WHEN** design approval, spec review, user spec review, and plan generation all succeed in `full_skill` mode
- **THEN** the session exposes a completion state that includes both the design spec artifact and the implementation plan artifact

#### Scenario: Conversation-mode session completes successfully
- **WHEN** a non-full-skill browser session reaches a mature runtime deliverable
- **THEN** the session completes with that runtime deliverable and MUST NOT invent a spec-and-plan bundle

#### Scenario: Workflow reaches plan completion
- **WHEN** the explicit `full_skill` `spec + plan` bundle is ready
- **THEN** the backend stops short of auto-starting implementation work

### Requirement: Internal quality loops continue automatically until success or a real block
The system MUST keep internal review and correction loops inside the workflow unless they cannot be resolved automatically within the configured retry budget.

#### Scenario: Spec review finds issues within budget
- **WHEN** the internal spec review loop identifies correctable issues
- **THEN** the backend revises the draft and re-runs review without requiring the user to manage reviewer mechanics directly

#### Scenario: Review loop cannot converge
- **WHEN** the internal review loop exceeds its retry budget or encounters a blocking issue
- **THEN** the session pauses at a user-facing guidance state and asks for a decision using non-technical language

