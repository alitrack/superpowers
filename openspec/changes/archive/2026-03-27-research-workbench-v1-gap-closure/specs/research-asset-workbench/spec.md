## ADDED Requirements

### Requirement: Browser workbench SHALL allow switching the active V1 governance role
The browser workbench SHALL provide a lightweight role switcher for `Owner`, `Editor`, `Viewer`, and `Auditor` so governance behavior can be validated in-product without introducing a real identity system in V1.

#### Scenario: User changes active role
- **WHEN** the user selects a different V1 role in the browser workbench
- **THEN** subsequent workbench requests use that selected role context instead of a hardcoded `Owner`

#### Scenario: Auditor reviews the workbench
- **WHEN** the active role is `Auditor`
- **THEN** the workbench still shows readable governance data such as publish review, review requests, bundle preview, and audit entries while avoiding content-edit actions

#### Scenario: Viewer reviews the workbench
- **WHEN** the active role is `Viewer`
- **THEN** the workbench keeps research assets readable but does not surface governance write actions that the selected role cannot perform
