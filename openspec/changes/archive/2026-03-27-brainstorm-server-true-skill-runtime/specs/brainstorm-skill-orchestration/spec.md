## ADDED Requirements

### Requirement: Real Codex-backed brainstorming sessions must load required repository skills before replying
The system MUST require real Codex-backed brainstorming sessions to read the repository skill files used to govern the browser brainstorming flow before emitting the first user-facing structured message.

#### Scenario: Exec-backed turn starts
- **WHEN** the exec runtime builds a prompt for a real browser brainstorming turn
- **THEN** the prompt explicitly instructs the model to read `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` before replying

#### Scenario: App-server thread starts
- **WHEN** the app-server runtime opens a new brainstorming thread
- **THEN** the bootstrap instructions explicitly require reading `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` before the first browser-visible turn

### Requirement: Embedded skill excerpts are fallback, not the proof of loading
The system MUST treat any runtime-injected brainstorming-skill excerpt as fallback guidance rather than as proof that the live runtime has actually loaded the required skill files.

#### Scenario: Required skill files are readable
- **WHEN** the real runtime can read the repository skill files
- **THEN** it uses those live files as the primary source of skill guidance

#### Scenario: Required skill files cannot be read
- **WHEN** the runtime cannot read the repository skill files in the current environment
- **THEN** the embedded fallback excerpt may still guide the turn without falsely claiming that the skill files were loaded
