## ADDED Requirements

### Requirement: Visible questions and final results must preserve generation provenance
The system MUST persist provenance for each visible brainstorming question and final deliverable so developers can verify whether it came from the real skill-guided Codex path or a fallback path.

#### Scenario: Backend emits a visible question
- **WHEN** the runtime emits a user-facing `question`
- **THEN** the session stores provenance including backend mode, generation mode, required skill files, provider trace identifiers when available, and generation timestamp

#### Scenario: Backend emits a completed deliverable
- **WHEN** the runtime emits `summary` or `artifact_ready`
- **THEN** the session stores provenance for the final deliverable including whether the result came from the real skill-guided path, a fallback excerpt path, or a fake runtime path

### Requirement: Provenance is inspectable without polluting the normal user-facing UI
The system MUST make provenance available through developer-facing inspection surfaces or API responses while keeping the standard brainstorming UI focused on the artifact itself.

#### Scenario: Developer inspects a session
- **WHEN** a developer or test harness requests session inspection data
- **THEN** the response includes the stored question/result provenance

#### Scenario: Normal user views the brainstorming product
- **WHEN** the session is rendered in the standard browser experience
- **THEN** provenance details are not required to appear in the main user-facing artifact view
