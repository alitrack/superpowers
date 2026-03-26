# research-asset-governance Specification

## Purpose
TBD - created by archiving change enterprise-research-asset-workbench-v1. Update Purpose after archive.
## Requirements
### Requirement: The system MUST enforce role-based permissions for research asset actions
The system MUST enforce the V1 role model `Owner`, `Editor`, `Viewer`, and `Auditor` for research asset actions.

#### Scenario: Editor attempts a high-risk governance action
- **WHEN** an `Editor` attempts to revoke a published bundle, replace a confirmed judgment, or share a bundle across teams
- **THEN** the system denies the action

#### Scenario: Auditor accesses governance data
- **WHEN** an `Auditor` opens governance information
- **THEN** the system allows read-only access to audit data without allowing content edits

### Requirement: The system SHALL support minimal review requests for evidence review and publish approval
The system SHALL persist a minimal `ReviewRequest` workflow for `evidence-review` and `publish-approval`.

#### Scenario: Requesting evidence review
- **WHEN** an authorized user requests evidence review for an `Evidence` item
- **THEN** the system creates an `Open` review request linked to that evidence and assigns it to a specific reviewer

#### Scenario: Requesting publish approval
- **WHEN** an authorized user requests publish approval for a workspace in `ReadyForPublish`
- **THEN** the system creates an `Open` review request linked to that workspace

#### Scenario: Review request is resolved
- **WHEN** a reviewer finishes processing a request
- **THEN** the system changes the request status to `Resolved` or `Rejected` and preserves the request history

### Requirement: The system MUST record audit entries for governed actions
The system MUST record audit entries for governed actions including publication, revocation, permission changes, evidence verification or acceptance, critical confidence changes, export, and cross-team sharing.

#### Scenario: Publishing a bundle
- **WHEN** a bundle is published
- **THEN** the system records an audit entry with actor, target, version, before and after state, reason, and details

#### Scenario: Evidence is verified
- **WHEN** an evidence item is marked `Verified`
- **THEN** the system records an audit entry for the verification action

### Requirement: Agent-triggered high-risk actions MUST require human confirmation
The system MUST require a human confirmation step before any agent-triggered high-risk action is finalized.

#### Scenario: Agent proposes publish
- **WHEN** an agent attempts to publish a workspace
- **THEN** the system creates or routes through a human confirmation step instead of publishing directly

#### Scenario: Agent proposes evidence acceptance
- **WHEN** an agent attempts to mark evidence as `Verified` or `Accepted`
- **THEN** the system blocks the direct state transition until an authorized human confirms it

