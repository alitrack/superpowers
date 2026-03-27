# brainstorm-skill-orchestration Specification

## Purpose
Define how the web runtime uses the repository’s current brainstorming skill as the primary facilitation policy for Codex-backed brainstorming sessions.

## Requirements
### Requirement: Codex-backed brainstorming sessions are grounded in the current brainstorming skill
The system MUST ground Codex-backed browser brainstorming sessions in the current repository `skills/brainstorming/SKILL.md` guidance rather than relying only on hand-authored runtime prose.

#### Scenario: Skill-backed session starts
- **WHEN** a Codex-backed browser brainstorming session is created
- **THEN** the runtime prompt includes policy derived from the current `skills/brainstorming/SKILL.md`

#### Scenario: Current skill changes
- **WHEN** the repository brainstorming skill is updated
- **THEN** newly created Codex-backed sessions use the updated skill-derived policy without requiring a separate hardcoded prompt rewrite

### Requirement: Real Codex-backed brainstorming sessions must load required repository skills before replying
The system MUST require real Codex-backed brainstorming sessions to read the repository skill files used to govern the browser brainstorming flow before emitting the first user-facing structured message.

#### Scenario: Exec-backed turn starts
- **WHEN** the exec runtime builds a prompt for a real browser brainstorming turn
- **THEN** the prompt explicitly instructs the model to read `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` before replying

#### Scenario: App-server thread starts
- **WHEN** the app-server runtime opens a new brainstorming thread
- **THEN** the bootstrap instructions explicitly require reading `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` before the first browser-visible turn

### Requirement: Web runtime constrains skill guidance to the browser conversation stage
The system MUST adapt brainstorming skill guidance to the browser host so the session stays inside the structured conversation contract instead of attempting repo-writing side effects during a user-facing brainstorm.

#### Scenario: Skill guidance includes later engineering workflow steps
- **WHEN** the runtime loads the brainstorming skill
- **THEN** it only applies the portions needed for the browser conversation stage and suppresses direct file-writing or commit actions

#### Scenario: Formal browser message is emitted
- **WHEN** the Codex-backed runtime produces the next user-facing turn
- **THEN** the output still conforms to `question`, `summary`, or `artifact_ready`

### Requirement: Embedded skill excerpts are fallback, not the proof of loading
The system MUST treat any runtime-injected brainstorming-skill excerpt as fallback guidance rather than as proof that the live runtime has actually loaded the required skill files.

#### Scenario: Required skill files are readable
- **WHEN** the real runtime can read the repository skill files
- **THEN** it uses those live files as the primary source of skill guidance

#### Scenario: Required skill files cannot be read
- **WHEN** the runtime cannot read the repository skill files in the current environment
- **THEN** the embedded fallback excerpt may still guide the turn without falsely claiming that the skill files were loaded
