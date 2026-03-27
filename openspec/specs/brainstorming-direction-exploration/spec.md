# brainstorming-direction-exploration Specification

## Purpose
Define how the backend surfaces multiple viable directions, compares them, and narrows toward a selected path instead of only collecting linear questionnaire fields.

## Requirements
### Requirement: Brainstorming sessions explicitly surface multiple viable directions before convergence
The system MUST support a divergence stage where the backend produces multiple plausible directions, frames, or solution paths instead of always pushing the user down a single implicit track.

#### Scenario: Divergence is needed
- **WHEN** the backend determines that the problem is understood well enough to explore alternatives
- **THEN** it records and works from multiple candidate directions rather than immediately committing to one path

#### Scenario: Alternatives are shown to the user
- **WHEN** the backend asks the user to compare or select among directions
- **THEN** the structured question reflects distinct candidate directions rather than variations of the same intake field

### Requirement: Convergence uses explicit comparison or decision criteria
The system MUST help the user converge by comparing candidate directions against clear criteria instead of silently selecting a path.

#### Scenario: User must choose among directions
- **WHEN** multiple candidate directions remain viable
- **THEN** the backend emits a question that asks the user to compare or select using a clear decision frame

#### Scenario: Backend recommends a path
- **WHEN** the backend has enough information to recommend one direction
- **THEN** the recommendation is grounded in the surfaced alternatives and the session's decision criteria

### Requirement: Completion outputs preserve the explored directions and selected path
The system MUST include enough structured information in the completion output to show what was explored and what was ultimately selected.

#### Scenario: Summary completes the session
- **WHEN** the session finishes with a `summary`
- **THEN** the payload captures the chosen path and the key explored directions that informed the decision

#### Scenario: Artifact completes the session
- **WHEN** the session finishes with `artifact_ready`
- **THEN** the generated artifact contains the selected direction and the rationale for why it won over the alternatives
