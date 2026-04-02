# brainstorm-web-artifacts Specification

## Purpose
Define how completed browser brainstorming sessions persist summaries and real output artifacts for later retrieval in the Web product.
## Requirements
### Requirement: Completed browser sessions can produce real persisted artifacts
The system MUST persist concrete brainstorming outputs so a completed session ends with a real runtime-derived artifact or finished-result export, and the browser host MUST NOT rewrite ordinary conversation results into workflow bundle artifacts unless the session actually ran in full-skill mode.

#### Scenario: Runtime returns an artifact-ready deliverable
- **WHEN** the backend generates a concrete `artifact_ready` result such as markdown or another real deliverable
- **THEN** the server stores that artifact content and records metadata for later retrieval without replacing it with a spec/plan bundle wrapper

#### Scenario: Runtime returns summary in artifact mode
- **WHEN** the backend finishes with `summary` and the browser session requested artifact persistence outside full-skill mode
- **THEN** the server may materialize a markdown export, but that export reflects the runtime title and deliverable sections rather than an injected workflow bundle

#### Scenario: Full-skill workflow returns bundle artifacts
- **WHEN** an explicit full-skill session completes with spec and plan artifacts
- **THEN** the server persists and exposes the resulting workflow bundle as the session artifact

### Requirement: Sessions preserve summaries even when no artifact file exists
The system MUST persist `summary`-level completion states so users can review converged sessions that do not yet produce a file artifact.

#### Scenario: Session ends with summary only
- **WHEN** the backend determines that the session is complete without a materialized file
- **THEN** it stores the `summary` payload and makes it available through the browser session history

#### Scenario: User revisits a summary-complete session
- **WHEN** the browser reopens a completed session whose state is `summary`
- **THEN** it renders the stored summary and answer path without requiring the session to be recomputed

### Requirement: Completed browser sessions can export the finished result in markdown and JSON
The system MUST expose a browser-readable export surface for the finished brainstorming result so users can retrieve the mature deliverable as both structured JSON and markdown, and those exports MUST preserve the runtime's result semantics instead of forcing a generic product wrapper.

#### Scenario: Browser requests structured result export
- **WHEN** the browser requests the completed session result as JSON
- **THEN** the server returns a normalized finished-result payload containing the runtime recommendation, deliverable sections, supporting artifacts, and export paths

#### Scenario: Browser requests markdown result export for conversation mode
- **WHEN** the browser requests markdown for a completed non-full-skill session
- **THEN** the server returns markdown whose title and body reflect the runtime result rather than a hardcoded spec-plan-oriented wrapper

#### Scenario: Browser requests markdown result export for full-skill mode
- **WHEN** the browser requests markdown for a completed explicit full-skill session
- **THEN** the server returns markdown for the finished runtime deliverable rather than the workflow bundle, while the bundle remains separately accessible through supporting artifact metadata

