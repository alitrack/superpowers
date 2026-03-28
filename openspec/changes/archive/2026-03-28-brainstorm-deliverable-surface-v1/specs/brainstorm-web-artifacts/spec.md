## ADDED Requirements

### Requirement: Completed browser sessions can export the finished result in markdown and JSON
The system MUST expose a browser-readable export surface for the finished brainstorming result so users can retrieve the mature deliverable as both structured JSON and markdown without manually opening repository files.

#### Scenario: Browser requests structured result export
- **WHEN** the browser requests the completed session result as JSON
- **THEN** the server returns a normalized finished-result payload containing recommendation, deliverable sections, supporting artifacts, and export paths

#### Scenario: Browser requests markdown result export
- **WHEN** the browser requests the completed session result as markdown
- **THEN** the server returns markdown representing the mature brainstorming deliverable instead of the supporting workflow bundle

## MODIFIED Requirements

### Requirement: Completed browser sessions can produce real persisted artifacts
The system MUST persist concrete brainstorming outputs so a completed session can end with a real `artifact_ready` result and a separately retrievable finished-result export instead of only a transient demo-only summary or a bundle-only artifact path.

#### Scenario: Session completes with a materialized output
- **WHEN** the backend generates a concrete result such as a markdown summary, structured result payload, or supporting bundle file
- **THEN** it stores the finished-result exports, records their metadata on the session, and emits `artifact_ready`

#### Scenario: Browser opens a completed result
- **WHEN** the browser loads a session whose completion state is `artifact_ready`
- **THEN** it can display the normalized finished result and retrieve the persisted result exports and supporting artifact metadata using the stored session data
