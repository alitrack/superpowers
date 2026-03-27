## MODIFIED Requirements

### Requirement: The system SHALL support minimal review requests for evidence review and publish approval
The system SHALL persist a minimal `ReviewRequest` workflow for `evidence-review` and `publish-approval`, and SHALL allow authorized users to resolve or reject those requests while preserving request history.

#### Scenario: Requesting evidence review
- **WHEN** an authorized user requests evidence review for an `Evidence` item
- **THEN** the system creates an `Open` review request linked to that evidence and assigns it to a specific reviewer

#### Scenario: Requesting publish approval
- **WHEN** an authorized user requests publish approval for a workspace in `ReadyForPublish`
- **THEN** the system creates an `Open` review request linked to that workspace

#### Scenario: Review request is resolved
- **WHEN** an authorized reviewer resolves a review request
- **THEN** the system changes the request status to `Resolved`, records who resolved it and when, and preserves the request history

#### Scenario: Review request is rejected
- **WHEN** an authorized reviewer rejects a review request
- **THEN** the system changes the request status to `Rejected`, records who rejected it and when, and preserves the request history
