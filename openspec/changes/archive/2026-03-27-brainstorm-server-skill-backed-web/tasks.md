## 1. Stable Entry

- [x] 1.1 Add a persistent new-brainstorm composer so the user can always enter a fresh topic even when older sessions exist.
- [x] 1.2 Adjust browser-shell rendering so old sessions no longer hide the primary “start a new brainstorm” path.

## 2. Skill-Backed Runtime

- [x] 2.1 Add a loader that reads the current `skills/brainstorming/SKILL.md` and extracts browser-conversation policy.
- [x] 2.2 Inject the skill-derived policy into app-server session startup and follow-up prompt building.
- [x] 2.3 Inject the same skill-derived policy into exec fallback prompt building.
- [x] 2.4 Keep existing fake/runtime fallback behavior for tests while clearly separating it from the skill-backed real path.

## 3. Verification

- [x] 3.1 Add regression tests proving the stable new-brainstorm entry is visible even with existing sessions.
- [x] 3.2 Add regression tests proving Codex-backed prompt composition includes the current brainstorming skill policy.
- [x] 3.3 Run the brainstorm-server verification suite plus a real smoke flow, and document how the skill-backed path is verified.
