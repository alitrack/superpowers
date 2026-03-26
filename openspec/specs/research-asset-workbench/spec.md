# research-asset-workbench Specification

## Purpose
TBD - created by archiving change enterprise-research-asset-workbench-v1. Update Purpose after archive.
## Requirements
### Requirement: Browser workbench SHALL expose research workspaces and published asset bundles
The system SHALL expose a browser-first workbench that lets users open mutable research workspaces separately from published research asset bundles.

#### Scenario: Workbench loads
- **WHEN** a user opens the browser workbench
- **THEN** the system shows available research workspaces and published asset bundles as distinct entries

#### Scenario: User opens a published asset
- **WHEN** a user selects a published research asset bundle
- **THEN** the workbench renders a read-only preview of the asset and does not present editable workspace controls

### Requirement: Workbench MUST surface publish review before creating a published bundle
The system MUST present a publish-review surface for a workspace before it creates a new `ResearchAssetBundle` version.

#### Scenario: Workspace is ready for publish
- **WHEN** a workspace enters `ReadyForPublish`
- **THEN** the system shows publish summary, validation results, and the version that will be created

#### Scenario: Publish validation fails
- **WHEN** a workspace fails one or more publish checks
- **THEN** the workbench shows the blocking reasons and does not create a published bundle

### Requirement: Published bundle preview SHALL preserve research traceability
The system SHALL show enough bundle metadata for users to understand where a published asset came from and what it contains.

#### Scenario: User reviews a published bundle
- **WHEN** a published asset bundle is rendered in the workbench
- **THEN** the UI shows its publish summary, version metadata, source workspace reference, and linked checkpoint or audit references

#### Scenario: Bundle includes preserved branches
- **WHEN** a published bundle contains `Parked` or `Superseded` hypotheses
- **THEN** the preview shows those branches as preserved research history rather than hiding them

