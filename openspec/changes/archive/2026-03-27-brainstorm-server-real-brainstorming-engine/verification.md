## Verification

### Automated Coverage

- `tests/brainstorm-server/codex-runtime-adapter.test.js`
  - Covers facilitation-state transitions, phase-aware prompt building, and handoff summary generation.
- `tests/brainstorm-server/codex-exec-provider.test.js`
  - Covers exec fallback continuity across divergence, convergence criteria, and final path commitment.
- `tests/brainstorm-server/brainstorm-quality-fixtures.test.js`
  - Covers four headless fixtures:
    - fuzzy product idea
    - differentiation problem
    - team-alignment case
    - execution-planning case
  - Locks the first three planner moves to `reframe -> diverge -> converge` instead of generic intake sequencing.

### Manual Quality Bar: "This Feels Like Real Brainstorming"

Treat a session as acceptable only if all of the following are true:

1. The first question asks for the messy situation, decision, tension, or uncertainty to untangle.
   - It must not start with a fixed intake sequence like `topic -> goal -> target user`.
2. The second turn performs problem reframing.
   - The system should offer materially different frames for what the real problem might be.
3. The third turn surfaces multiple distinct directions.
   - The user should be comparing serious alternatives, not repeating clarifications.
4. Convergence is explicit.
   - The system should ask for a decision criterion before committing to a path when multiple directions remain viable.
5. The handoff preserves reasoning.
   - The final summary or artifact should name:
     - the chosen path
     - explored alternatives
     - the criterion or rationale that made the winner win

### Real Smoke Evidence

Date: 2026-03-25

Environment:
- Local server: `node skills/brainstorming/scripts/server.cjs`
- Runtime mode: default real backend

Observed sequence from `/api/sessions` and `/api/sessions/:id/answers`:

1. First question:
   - `Please describe the specific messy situation or hard decision you are facing right now, including what makes it genuinely difficult to resolve.`
2. Second question after topic answer:
   - `Which problem framing should we optimize for first?`
   - Options included `Facilitation gap`, `Interaction model mismatch`, `Decision quality gap`, `Team workflow disconnect`
3. Third question after selecting `Facilitation gap`:
   - `Which directions should we explore as serious solution paths for the facilitation gap?`
   - Options included `Dynamic facilitation engine`, `Structured challenge loops`, `Role-based collaboration modes`, `Outcome-backward orchestration`, `Facilitator copilot layer`

Result:
- The live runtime advanced through `scope -> reframe -> diverge`.
- The session stored phase metadata, candidate directions, and decision trail in persisted session state.
- The live sequence cleared the quality bar for “not just a form,” because it moved into reframing and alternative generation before asking for more generic background fields.
