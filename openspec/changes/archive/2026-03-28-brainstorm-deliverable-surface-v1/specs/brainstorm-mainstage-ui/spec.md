## MODIFIED Requirements

### Requirement: The browser mainstage SHALL use a dedicated completion surface for the finished bundle
The browser brainstorming product SHALL present the finished session as an outcome-first completion surface where the mature brainstorming deliverable is the primary visible cluster, while the generated `spec + plan` package remains supporting context rather than the only visible completion object.

#### Scenario: Session reaches finished completion
- **WHEN** the workflow completes with a mature deliverable and supporting generated artifacts
- **THEN** the workspace switches to a dedicated result presentation where the recommendation and finished deliverable sections are the main visible cluster

#### Scenario: Supporting package is still available after completion
- **WHEN** the user views a completed session
- **THEN** the design spec, implementation plan, and result bundle remain visible as supporting package cards without replacing the finished-result surface as the primary focus

#### Scenario: User starts another brainstorm after completion
- **WHEN** the user wants to begin a new brainstorm while viewing a completed session
- **THEN** the fresh-topic entry path remains clearly available inside the workspace without hiding or overwriting the completed result by default
