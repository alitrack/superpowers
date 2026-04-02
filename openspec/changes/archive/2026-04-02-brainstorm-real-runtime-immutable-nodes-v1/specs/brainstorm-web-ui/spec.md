## ADDED Requirements

### Requirement: Product-mode runtime failures SHALL be visible in the browser
The browser product MUST surface explicit real-runtime failure states to the user when a live Codex question cannot be created or continued, instead of pretending the product is still running a live brainstorming session.

#### Scenario: Session creation cannot reach a real backend
- **WHEN** the browser requests a new product brainstorming session and no real backend can create the first question
- **THEN** the browser shows an explicit failure state and does not render a fake first question as if it came from Codex

#### Scenario: Existing session cannot continue
- **WHEN** the browser submits an answer for an existing real session and that session cannot continue with its persisted real backend
- **THEN** the browser shows an explicit continuation failure and does not swap the session into a fake-question flow
