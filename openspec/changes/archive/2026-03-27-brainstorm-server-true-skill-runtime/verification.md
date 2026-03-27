## Verification

### Automated Coverage

- `node tests/brainstorm-server/codex-runtime-adapter.test.js`
  - Verifies turn prompts now include explicit required-skill bootstrap instructions
  - Verifies the runtime prompt names both `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md`
- `node tests/brainstorm-server/codex-exec-provider.test.js`
  - Verifies exec-backed prompt composition includes explicit repository skill-loading instructions on session start
- `node tests/brainstorm-server/codex-app-server-provider.test.js`
  - Verifies app-server `startThread` bootstrap instructions now permit required skill-file loading and mention both required skill files
- `npm --prefix tests/brainstorm-server test`
  - Full brainstorm-server suite passed after the runtime bootstrap change
- `openspec validate brainstorm-server-true-skill-runtime`
  - Change artifacts validate successfully

### Real Smoke Evidence

Date: 2026-03-25

Environment:

- Server command: `BRAINSTORM_PORT=54902 BRAINSTORM_DIR=/tmp/brainstorm-live-54902 BRAINSTORM_RUNTIME_MODE=real node skills/brainstorming/scripts/server.cjs`
- URL: `http://localhost:54902/app`
- Runtime mode: real app-server backend

Observed checks:

1. Browser shell source still contained:
   - `New Session`
   - `Start A New Brainstorm`
   - `persistent-seed-input`
2. `POST /api/sessions` with:
   - `completionMode: "summary"`
   - `initialPrompt: "这个 brainstorming web 产品现在真的会先按当前 skills 来协作推进，而不是只读一段 prompt 摘录吗？"`
3. Response showed:
   - `backendMode: "app-server"`
   - persisted `seedPrompt`
   - `strategyState.phase: "reframe"`
   - first user-facing message type `question`
4. First formal question was already about validating the user's skill-loading concern, with reframe options such as:
   - `执行真实性`
   - `优先级一致性`
   - `流程可审计性`
   - `退化风险控制`
5. Sequential follow-up reads confirmed persistence:
   - `GET /api/sessions` returned the created session
   - `GET /api/sessions/<id>` returned the same `app-server` session state and first question

Conclusion:

- The live server still creates real `app-server` sessions after the bootstrap change.
- The runtime now explicitly instructs real Codex-backed turns to load repository skill files before responding, instead of relying only on a prompt excerpt.
