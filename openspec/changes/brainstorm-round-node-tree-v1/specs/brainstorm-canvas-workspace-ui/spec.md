## MODIFIED Requirements

### Requirement: The browser SHALL present a dedicated brainstorming canvas workspace
The browser brainstorming product SHALL present each active session inside a dedicated decision-tree workbench where `node0` is the seed topic, each formal backend question or checkpoint is rendered as one round node on the visible tree, and explicit branch subtrees appear only after the user triggers a fork action, instead of keeping current option cards as persistent graph peers.

#### Scenario: Linear session is shown in the canvas workspace
- **WHEN** the browser opens a brainstorming session that is still moving through one mainline path without an explicit fork
- **THEN** it renders a single trunk of round nodes such as `topic -> round1 -> round2 -> active round`, and the current options stay inside the active round node rather than appearing as sibling graph nodes

#### Scenario: Explicit fork creates visible branch subtrees
- **WHEN** the user explicitly expands multiple shortlisted directions into branches from a round node
- **THEN** the canvas renders child round nodes beneath that parent round, one per materialized branch, and each child represents the next branch question or branch state rather than the raw selected option card alone
