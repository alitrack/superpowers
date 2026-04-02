## MODIFIED Requirements

### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, shortlist, materialize branch runs, and continue a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel.

#### Scenario: User shortlists multiple options
- **WHEN** the current active decision is branchable and the user selects multiple candidate options
- **THEN** the browser keeps those selections as a shortlist until the user explicitly chooses to materialize them as branch runs

#### Scenario: User materializes branches
- **WHEN** the user invokes the explicit branch-materialization action for the selected shortlist
- **THEN** the browser creates or loads the corresponding branch-run nodes inside the same workspace instead of silently pretending they already existed

## ADDED Requirements

### Requirement: Browser actions SHALL use product semantics for branching
The browser SHALL describe shortlist and branch actions in user-facing brainstorming language so the user can tell the difference between “these are options worth comparing” and “these have become real branches to continue.”

#### Scenario: User is still comparing options
- **WHEN** the browser renders an active decision with candidate options
- **THEN** the visible actions describe selecting, shortlisting, or comparing options rather than implying branch execution has already begun

#### Scenario: User is ready to fork
- **WHEN** the user has selected multiple branchable options
- **THEN** the browser presents a dedicated action such as “Explore selected as branches” instead of auto-forking from the mere fact of multi-select
