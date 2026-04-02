# brainstorm-web-ui Specification

## Purpose
Define the browser-first brainstorming experience that lets a user complete a structured flow inside the Web UI without terminal dependence.
## Requirements
### Requirement: The browser can complete a structured brainstorming flow without terminal dependence
The system MUST let a user start, answer, and complete a structured brainstorming session inside the Web UI without requiring the terminal as the primary interaction channel, and each accepted answer MUST advance the visible workbench by creating or activating the next round node on the same trunk or branch rather than by drawing current option cards as persistent tree nodes.

#### Scenario: Active question is shown in the browser
- **WHEN** the browser receives the current session message
- **THEN** it renders the one active structured question or approval decision as the active round node of the workbench and keeps its options embedded inside that node as answer controls

#### Scenario: Session advances in the browser
- **WHEN** the backend returns the next `question`, `summary`, or `artifact_ready` after an answer is submitted
- **THEN** the browser appends or activates the next round node in the same workspace and keeps the user inside the same round-oriented product experience

#### Scenario: Explicit fork is requested
- **WHEN** the user invokes the explicit branch action for multiple shortlisted directions
- **THEN** the browser creates child round nodes for those branch paths inside the same workspace instead of merely drawing lines to raw option labels

### Requirement: The product UI hides protocol metadata by default
The system MUST present a product-facing experience rather than a protocol-debug screen.

#### Scenario: Question is rendered for an end user
- **WHEN** the browser shows a structured brainstorming step
- **THEN** protocol fields such as internal type names, question ids, or transport debug markers are hidden unless an explicit debug mode is enabled

#### Scenario: User reviews prior progress
- **WHEN** the browser shows session history or progress
- **THEN** it uses user-facing labels and summaries rather than raw transport payload fields

