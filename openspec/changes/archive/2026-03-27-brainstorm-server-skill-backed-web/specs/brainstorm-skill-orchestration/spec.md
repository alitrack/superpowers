## ADDED Requirements

### Requirement: Codex-backed brainstorming sessions are grounded in the current brainstorming skill
The system MUST ground Codex-backed browser brainstorming sessions in the current repository `skills/brainstorming/SKILL.md` guidance rather than relying only on hand-authored runtime prose.

#### Scenario: Skill-backed session starts
- **WHEN** a Codex-backed browser brainstorming session is created
- **THEN** the runtime prompt includes policy derived from the current `skills/brainstorming/SKILL.md`

#### Scenario: Current skill changes
- **WHEN** the repository brainstorming skill is updated
- **THEN** newly created Codex-backed sessions use the updated skill-derived policy without requiring a separate hardcoded prompt rewrite

### Requirement: Web runtime constrains skill guidance to the browser conversation stage
The system MUST adapt brainstorming skill guidance to the browser host so the session stays inside the structured conversation contract instead of attempting repo-writing side effects during a user-facing brainstorm.

#### Scenario: Skill guidance includes later engineering workflow steps
- **WHEN** the runtime loads the brainstorming skill
- **THEN** it only applies the portions needed for the browser conversation stage and suppresses direct file-writing or commit actions

#### Scenario: Formal browser message is emitted
- **WHEN** the Codex-backed runtime produces the next user-facing turn
- **THEN** the output still conforms to `question`, `summary`, or `artifact_ready`
