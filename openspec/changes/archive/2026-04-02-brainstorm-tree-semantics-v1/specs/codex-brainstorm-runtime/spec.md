## MODIFIED Requirements

### Requirement: Browser brainstorming sessions run on a real Codex-backed runtime
The system MUST persist enough runtime state to represent materialized branch runs inside one brainstorming session rather than forcing all shortlisted options back into one linear transcript.

#### Scenario: Branch runs are materialized
- **WHEN** the browser requests branch materialization for selected options from a branchable decision
- **THEN** the runtime persists branch-run state with parent decision identity, source option identity, current status, and per-branch progress

#### Scenario: Reloaded session contains branch runs
- **WHEN** the browser reloads a session that already contains branch runs
- **THEN** the runtime restores those branch runs and the previously selected branch context instead of collapsing the session back to a generic mainline question

## ADDED Requirements

### Requirement: Branch runs SHALL support bounded parallel state within one session
The runtime layer MUST support a bounded number of active or queued branch runs within one brainstorming session and expose deterministic state for each branch run.

#### Scenario: More than one branch run exists
- **WHEN** the user materializes multiple selected options into branch runs
- **THEN** the runtime records each branch run with a status such as queued, active, paused, or complete and keeps the non-selected branch runs recoverable

#### Scenario: User continues one branch run
- **WHEN** the user answers the current question for one selected branch run
- **THEN** the runtime advances that branch run without losing the status or identity of the sibling branch runs
