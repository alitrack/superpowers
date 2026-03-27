## Verification

### Automated Coverage

- `node tests/brainstorm-server/codex-runtime-adapter.test.js`
  - Verifies the runtime loads policy derived from `skills/brainstorming/SKILL.md`
  - Verifies `buildBrainstormTurnPrompt(...)` includes the skill source path and current skill guidance
- `node tests/brainstorm-server/codex-exec-provider.test.js`
  - Verifies exec fallback prompt composition includes the current brainstorming skill policy
- `node tests/brainstorm-server/web-product.test.js`
  - Verifies the browser shell always includes the stable new-brainstorm composer
  - Verifies the composer remains present even when sessions already exist
  - Verifies seeded sessions do not start from the generic intake question
- `npm --prefix tests/brainstorm-server test`
  - Full brainstorm-server verification suite passed

### Manual Quality Bar: "Stable Entry + Skill-Backed"

Treat the behavior as acceptable only if all of the following are true:

1. The browser page always exposes a clear “start a new brainstorm” entry path.
2. Existing sessions can remain visible, but they do not hide the fresh-topic entry affordance.
3. Codex-backed prompt composition explicitly includes policy derived from `skills/brainstorming/SKILL.md`.
4. The first formal question after seed entry is grounded in the user’s topic and not another “what do you want to brainstorm?” intake prompt.
5. Fake runtime behavior is still available for tests, but the real Codex-backed path is the primary product path.

### Real Smoke Evidence

Date: 2026-03-25

Environment:
- Server command: `BRAINSTORM_DIR=/tmp/brainstorm-skill-backed-smoke node skills/brainstorming/scripts/server.cjs`
- URL: `http://localhost:49494`
- Runtime mode: default real backend

Observed checks:

1. Fresh startup:
   - `GET /api/sessions` returned `[]`
2. Browser shell source:
   - `GET /app` contained:
     - `Start A New Brainstorm`
     - `persistent-seed-input`
     - `New Session`
3. Seeded session creation:
   - `POST /api/sessions` with:
     - `completionMode: "summary"`
     - `initialPrompt: "我们有一个 brainstorming 产品，但它还是太像表单；我想让它真的像一个会挑战和推进思路的协作伙伴。"`
4. Result:
   - Response persisted `seedPrompt`
   - `strategyState.phase` was `reframe`
   - First formal question was:
     - `围绕“让 brainstorming 产品不再像表单，而像会挑战并推进思路的协作伙伴”，你更想先按哪种问题框架推进？`
   - Options were problem frames, not generic intake fields

Conclusion:
- The browser now exposes a stable fresh-topic entry path even before or alongside existing sessions.
- The real Codex-backed runtime begins from a skill-grounded brainstorming move rather than a generic intake question.
