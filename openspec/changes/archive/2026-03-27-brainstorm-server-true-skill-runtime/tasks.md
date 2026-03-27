## 1. Real Skill Bootstrap

- [x] 1.1 Add explicit required-skill bootstrap instructions that tell real Codex-backed turns to read `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` before replying.
- [x] 1.2 Update base runtime instructions so loading those required skill files is allowed, while unrelated repo inspection remains blocked by default.
- [x] 1.3 Keep the embedded brainstorming-skill excerpt only as fallback guidance rather than the primary runtime proof of skill loading.

## 2. Provider Wiring

- [x] 2.1 Ensure exec prompt composition includes the required skill bootstrap instructions on each turn.
- [x] 2.2 Ensure app-server bootstrap instructions include the required skill bootstrap instructions before the first browser-visible turn.

## 3. Verification

- [x] 3.1 Add regression tests proving runtime prompts now require actual repository skill reads.
- [x] 3.2 Add regression tests proving app-server thread bootstrap includes the required skill-loading instructions.
- [x] 3.3 Run targeted tests plus the full brainstorm-server suite, then capture a real smoke result showing the live server still creates a real session after the new bootstrap.
