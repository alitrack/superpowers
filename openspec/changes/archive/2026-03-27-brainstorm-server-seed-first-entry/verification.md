## Verification

### Automated Coverage

- `node tests/brainstorm-server/codex-runtime-adapter.test.js`
  - Covers fake runtime seeded-session initialization and confirms seeded sessions do not start from `root-goal`.
- `node tests/brainstorm-server/web-session-manager.test.js`
  - Covers passing `initialPrompt` into runtime session creation and persisting `seedPrompt` through reload.
- `node tests/brainstorm-server/web-product.test.js`
  - Covers:
    - browser shell exposes seed-entry UI
    - fresh page load does not auto-create an empty session
    - seeded API session creation
    - first formal question after seed entry is not the generic intake question
- `npm --prefix tests/brainstorm-server test`
  - Full brainstorm-server verification suite passed.

### Manual Quality Bar: "Seed First, Then Brainstorm"

Treat the behavior as acceptable only if all of the following are true:

1. The browser does not auto-create an empty session on fresh load.
2. The user can state the brainstorming topic before any formal backend question is shown.
3. The initial user topic is persisted as `seedPrompt` and remains visible after reload or resume.
4. The first formal backend question after seed entry is a real brainstorming move.
   - It must not be another variant of “What do you want to brainstorm?”
5. The first formal question should already be grounded in the user seed.
   - Typical acceptable moves: reframe, clarify tension, surface directions.

### Real Smoke Evidence

Date: 2026-03-25

Environment:
- Server command: `BRAINSTORM_DIR=/tmp/brainstorm-seed-smoke node skills/brainstorming/scripts/server.cjs`
- URL: `http://localhost:51713`
- Runtime mode: default real backend

Observed sequence:

1. Before loading the page:
   - `GET /api/sessions` returned `[]`
2. After loading `/app`:
   - `GET /api/sessions` still returned `[]`
   - This confirms the page no longer auto-creates an empty session
3. Seeded session creation:
   - `POST /api/sessions` with:
     - `completionMode: "summary"`
     - `initialPrompt: "我们已经做了一个头脑风暴产品原型，但它仍然像表单，而不是像能帮助团队发现更好路径的协作伙伴。"`
4. Result of seeded session creation:
   - Response persisted `seedPrompt`
   - `strategyState.phase` was `reframe`
   - First formal question was `请选择最值得优先验证的问题框架`
   - Options were problem frames, not topic-intake fields

Conclusion:
- The browser product now starts with seed capture rather than empty-session auto-start.
- Seeded sessions begin with a real brainstorming move instead of a generic intake question.
