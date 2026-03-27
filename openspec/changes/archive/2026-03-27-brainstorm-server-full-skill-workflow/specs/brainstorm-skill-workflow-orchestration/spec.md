## ADDED Requirements

### Requirement: Browser brainstorming sessions execute the full skill workflow through plan completion
The system MUST allow a browser-first brainstorming session to progress through the complete `brainstorming` workflow up to `writing-plans` completion without requiring the user to leave the UI.

#### Scenario: Session starts in full workflow mode
- **WHEN** a user starts a brainstorming session in the browser product
- **THEN** the backend initializes the full workflow rather than stopping at a conversation-only summary path

#### Scenario: Design is approved in the browser
- **WHEN** the user approves the design presented in the browser flow
- **THEN** the backend continues with design-doc writing, spec review, user spec review, and plan generation until a plan-ready result or an explicit block is reached

### Requirement: V1 completion produces a reviewable spec-and-plan bundle
The system MUST treat a brainstorming session as complete for V1 only after it has produced both a reviewable design spec and a reviewable implementation plan.

#### Scenario: Workflow completes successfully
- **WHEN** design approval, spec review, user spec review, and plan generation all succeed
- **THEN** the session exposes a completion state that includes both the design spec artifact and the implementation plan artifact

#### Scenario: Workflow reaches plan completion
- **WHEN** the V1 `spec + plan` bundle is ready
- **THEN** the backend stops short of auto-starting implementation work

### Requirement: Internal quality loops continue automatically until success or a real block
The system MUST keep internal review and correction loops inside the workflow unless they cannot be resolved automatically within the configured retry budget.

#### Scenario: Spec review finds issues within budget
- **WHEN** the internal spec review loop identifies correctable issues
- **THEN** the backend revises the draft and re-runs review without requiring the user to manage reviewer mechanics directly

#### Scenario: Review loop cannot converge
- **WHEN** the internal review loop exceeds its retry budget or encounters a blocking issue
- **THEN** the session pauses at a user-facing guidance state and asks for a decision using non-technical language
