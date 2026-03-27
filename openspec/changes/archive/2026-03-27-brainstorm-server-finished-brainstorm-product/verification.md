## Verification

### Targeted Tests

Ran the focused brainstorm-server tests that cover the finished-product bar, provenance persistence, host rendering, and real-provider fallback behavior.

```bash
node tests/brainstorm-server/codex-runtime-adapter.test.js
node tests/brainstorm-server/codex-app-server-provider.test.js
node tests/brainstorm-server/brainstorm-quality-fixtures.test.js
node tests/brainstorm-server/structured-host.test.js
node tests/brainstorm-server/web-session-manager.test.js
node tests/brainstorm-server/web-product.test.js
```

Results:

- `codex-runtime-adapter.test.js`: 11 passed, 0 failed
- `codex-app-server-provider.test.js`: 4 passed, 0 failed
- `brainstorm-quality-fixtures.test.js`: 2 passed, 0 failed
- `structured-host.test.js`: 16 passed, 0 failed
- `web-session-manager.test.js`: 7 passed, 0 failed
- `web-product.test.js`: 10 passed, 0 failed

### Full Suite

Ran the full brainstorm-server suite:

```bash
npm --prefix tests/brainstorm-server test
```

Final result: passed.

Notes:

- One initial full-suite run hit a transient timeout in `tests/brainstorm-server/server.test.js` (`returns the next structured message after an answer is submitted`).
- Re-running `node tests/brainstorm-server/server.test.js` passed cleanly.
- Re-running the full suite then passed cleanly end to end, including `codex-background-guard.test.sh`.

### Real Smoke Flow

Verified against the live browser server already running at:

```text
http://localhost:54904/app
```

Created a real seeded session through the HTTP API:

```http
POST /api/sessions
{
  "completionMode": "summary",
  "initialPrompt": "我们要做一个真正可验收的 Codex brainstorming web 产品，而不是半成品演示。"
}
```

Observed runtime properties on the created session:

- `backendMode = "app-server"`
- first visible question provenance `generationMode = "real-skill-runtime"`
- `requiredSkills` included:
  - `skills/using-superpowers/SKILL.md`
  - `skills/brainstorming/SKILL.md`

Completed the real session with four structured answers:

1. `A` -> 验收优先框架（推荐）
2. `B,E` -> 最小闭环用例先行 + 人机协作体验先行
3. `A` -> 可验收确定性（推荐）
4. `A` -> 最小闭环用例先行（推荐）

Verified the final state:

- final message type: `summary`
- final provenance `generationMode = "real-skill-runtime"`
- final provenance `completionGateVersion = "finished-deliverable-v1"`
- `deliverable.isComplete = true`
- final deliverable included the mature sections:
  - `Recommendation`
  - `Problem Framing`
  - `Explored Approaches`
  - `Why This Path Currently Wins`
  - `Alternatives Still Worth Remembering`
  - `Design / Execution Draft`
  - `Risks / Open Questions`
  - `Next Actions`

Verified developer-facing provenance inspection:

```http
GET /api/sessions/e06acbf4-6d5e-4d44-82b3-f9daccf85219/provenance
```

Observed:

- 4 stored visible-question provenance records
- `finalResult.generationMode = "real-skill-runtime"`
- `finalResult.completionGateVersion = "finished-deliverable-v1"`

Conclusion:

- The product now reaches a verifiable finished brainstorming artifact instead of stopping at a shallow recap.
- Provenance is persisted and inspectable through a developer-facing surface without requiring exposure in the default user-facing UI.
