## MODIFIED Requirements

### Requirement: The system SHALL preserve research branches and checkpoints as part of lifecycle history
The system SHALL preserve `Parked` and `Superseded` branches and record checkpoints for key lifecycle milestones through explicit lifecycle actions rather than relying on pre-seeded status values.

#### Scenario: Hypothesis is parked
- **WHEN** an authorized user parks an active hypothesis
- **THEN** the system keeps that branch in workspace history, stores the hypothesis in `Parked` state, and records a `hypothesis_parked_or_superseded` checkpoint for the workspace

#### Scenario: Hypothesis is superseded
- **WHEN** an authorized user marks a hypothesis as superseded by a stronger branch
- **THEN** the system keeps that branch in workspace history, stores the hypothesis in `Superseded` state, and records a `hypothesis_parked_or_superseded` checkpoint for the workspace

#### Scenario: Judgment is confirmed
- **WHEN** a judgment transitions to `Confirmed`
- **THEN** the system records a `judgment_confirmed_or_superseded` checkpoint for that workspace
