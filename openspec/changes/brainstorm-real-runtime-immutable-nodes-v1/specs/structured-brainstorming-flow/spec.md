## ADDED Requirements

### Requirement: Formal questions SHALL become stable historical nodes
The system MUST treat each generated formal question as a stable historical node once shown to the user, so later branching and review can rely on that node as a fixed ancestor rather than a mutable projection of current session state.

#### Scenario: User revisits an earlier question node
- **WHEN** the host reloads or inspects a previously generated question node
- **THEN** the visible title, description, and options for that node remain the same as when it was first generated

#### Scenario: Branch starts from an earlier question node
- **WHEN** the user explicitly forks from a question that has already been shown
- **THEN** the system appends new child nodes for the branch paths and preserves the parent question node exactly as originally generated
