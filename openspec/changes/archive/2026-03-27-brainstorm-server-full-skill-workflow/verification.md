# Verification

## Summary

This change was verified against the local brainstorm-server product and supporting test harnesses. The final state now supports:

- full-skill browser workflow sessions that end at a reviewable `spec + plan` bundle
- hidden automation for draft writing, internal review retry, checkpoint capture, and plan generation
- developer-only inspection for provenance, checklist state, hidden activity, and checkpoints
- timeout-driven fallback from unstable real backends to seeded local progress instead of hanging the user path

## Commands Run

### OpenSpec validation

```bash
openspec validate brainstorm-server-full-skill-workflow --type change --strict
```

Result:

- `Change 'brainstorm-server-full-skill-workflow' is valid`

### Brainstorm server test suite

```bash
npm --prefix tests/brainstorm-server test
```

Result:

- Full suite passed
- Key passing groups included:
  - `Workflow Artifact Engine`
  - `Workflow Policy`
  - `Web Session Manager`
  - `Web Product`
  - background guard

## End-to-End Smoke

### Fake runtime smoke

Command:

```bash
BRAINSTORM_SMOKE_PORT=3361 BRAINSTORM_SMOKE_RUNTIME_MODE=fake timeout 90s node tests/brainstorm-server/full-skill-smoke.js
```

Observed result:

- `/app` hid `generationMode`, `subagent`, and `git-backed`
- final stage reached `plan-ready`
- final artifact type was `workflow_bundle`
- artifact contained `Spec and Plan Bundle`
- artifact contained `Implementation Plan`
- artifact did not leak `subagent` or `required sub-skill`
- inspection reported:
  - `hiddenActivityCount: 19`
  - `checkpointCount: 4`
  - all 9 checklist items completed, with visual companion marked `not_needed`

Transcript summary:

1. `seed-reframe` at `clarify-problem`
2. `seed-directions` at `compare-directions`
3. `seed-criterion` at `compare-directions`
4. `seed-path` at `confirm-design`
5. `workflow-review-spec` at `review-spec`
6. `artifact_ready` at `plan-ready`

### Real runtime smoke with fallback

Command:

```bash
BRAINSTORM_SMOKE_PORT=3368 BRAINSTORM_SMOKE_RUNTIME_MODE=real timeout 90s node tests/brainstorm-server/full-skill-smoke.js
```

Observed result:

- `/app` hid `generationMode`, `subagent`, and `git-backed`
- final stage reached `plan-ready`
- final artifact type was `workflow_bundle`
- artifact contained `Spec and Plan Bundle`
- artifact contained `Implementation Plan`
- artifact did not leak `subagent` or `required sub-skill`
- inspection reported:
  - `hiddenActivityCount: 19`
  - `checkpointCount: 4`
  - all 9 checklist items completed, with visual companion marked `not_needed`

Transcript summary:

1. `question` at `clarify-problem`
2. `question` at `compare-directions`
3. `question` at `compare-directions`
4. `question` at `confirm-design`
5. `workflow-review-spec` at `review-spec`
6. `artifact_ready` at `plan-ready`

## Notable Behaviors Confirmed

- real answer submission timeout no longer leaves the browser path hanging forever; the session manager now falls back and continues
- hidden `codex exec` artifact generation no longer blocks indefinitely; timeout now triggers deterministic local artifact fallback
- default UI remains outcome-first while detailed provenance, checklist, hidden activity, and checkpoint data are only exposed through inspection APIs
