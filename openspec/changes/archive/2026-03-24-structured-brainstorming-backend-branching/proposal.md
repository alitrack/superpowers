## Why

The archived `structured-brainstorming` change established the transport contract and host behavior rules, but the browser demo still embeds a local question tree and resolves the next question inside the rendered page. That leaves the runtime behavior short of the intended model: the backend should own sequencing, and the host should only render one active question and collect input.

## What Changes

- Add a backend-side structured brainstorming runtime that owns session state, active question selection, and completion messages.
- Update the browser demo and server wiring so the host consumes backend-emitted `question` messages and only submits normalized `answer` payloads.
- Remove the need for the browser demo to embed a local branching tree or decide the next question after submission.
- Keep the existing message contract and schema files as the source of truth; this follow-up focuses on runtime compliance rather than redefining the protocol.

## Capabilities

### New Capabilities
- `structured-brainstorming-runtime`: Defines the backend-side session orchestration that drives structured brainstorming question flow while keeping hosts renderer-only.

### Modified Capabilities
- None.

## Impact

- Affects `skills/brainstorming/scripts/structured-demo.html`, `skills/brainstorming/scripts/server.cjs`, and the shared structured-host helpers used by the browser demo.
- Adds runtime/session behavior that the browser demo can exercise without requiring a full external app-server integration.
- Extends `tests/brainstorm-server/` so the runtime path is verified in addition to markup rendering and answer normalization.
