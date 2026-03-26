## ADDED Requirements

### Requirement: Each workspace MUST maintain a single root research question
The system MUST require every `Workspace` to contain exactly one root `ResearchQuestion`.

#### Scenario: Creating the first root question
- **WHEN** a new workspace is initialized
- **THEN** the system allows creation of one root `ResearchQuestion`

#### Scenario: Attempting to add a second root question
- **WHEN** a workspace already has a root `ResearchQuestion`
- **THEN** the system rejects creation of another root question and returns an explainable error

### Requirement: Evidence, judgment, and conclusion transitions MUST follow the research promotion path
The system MUST enforce the progression `Evidence -> Judgment -> Conclusion` so research claims cannot skip evidence review.

#### Scenario: Accepting evidence before verification
- **WHEN** an `Evidence` item has not reached `Verified`
- **THEN** the system refuses to mark it as `Accepted`

#### Scenario: Confirming a judgment without accepted evidence
- **WHEN** a `Judgment` does not reference at least one `Accepted Evidence`
- **THEN** the system refuses to change the judgment to `Confirmed`

#### Scenario: Publishing a conclusion without confirmed judgment
- **WHEN** a `Conclusion / NextStep` does not reference at least one `Confirmed Judgment`
- **THEN** the system refuses to publish the conclusion or create a published bundle from it

### Requirement: The system SHALL preserve research branches and checkpoints as part of lifecycle history
The system SHALL preserve `Parked` and `Superseded` branches and record checkpoints for key lifecycle milestones.

#### Scenario: Hypothesis is parked
- **WHEN** a hypothesis transitions to `Parked`
- **THEN** the system keeps the branch in workspace history and records a `hypothesis_parked_or_superseded` checkpoint

#### Scenario: Judgment is confirmed
- **WHEN** a judgment transitions to `Confirmed`
- **THEN** the system records a `judgment_confirmed_or_superseded` checkpoint for that workspace

### Requirement: Published research asset bundles MUST be immutable versioned snapshots
The system MUST create immutable `ResearchAssetBundle` versions from workspaces and MUST NOT allow published versions to be overwritten in place.

#### Scenario: Publishing a workspace
- **WHEN** a workspace passes publish validation
- **THEN** the system creates a new published bundle version that contains the root question, all hypotheses, the accepted evidence referenced by confirmed judgments, and the final conclusion metadata

#### Scenario: Editing after publish
- **WHEN** a user needs to continue work after a bundle has been published
- **THEN** the system requires cloning into a new workspace or creating a new published version instead of mutating the old one

#### Scenario: Revising a source after verification
- **WHEN** a user edits a frozen evidence source field after `Verified` or `Accepted`
- **THEN** the system creates a new evidence record in `Collected` state and leaves the original record unchanged
