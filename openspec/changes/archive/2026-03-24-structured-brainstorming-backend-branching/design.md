## Context

The archived `structured-brainstorming` change already defined the right contract:

- shared top-level messages: `question`, `answer`, `summary`, `artifact_ready`
- one active answerable question at a time
- backend-owned sequencing
- text override and shorthand normalization

The repo now has those artifacts and a reusable browser-side host module in `skills/brainstorming/scripts/structured-host.cjs`. However, the current `structured-demo.html` still embeds a local `flow` object and advances by calling host-side branching logic inside the page. That is useful as a visual proof of concept, but it does not satisfy the intended runtime boundary. The next implementation step is to move session state and sequencing to the backend/server side while keeping the host thin.

## Goals / Non-Goals

**Goals:**
- Make the browser structured demo consume backend-emitted `question` messages rather than a locally embedded flow tree.
- Move active-question state and next-question selection into a backend-side runtime module.
- Keep the browser host responsible only for rendering, local input capture, and answer normalization.
- Reuse the existing transport contract so this slice stays compatible with future terminal or GUI hosts.
- Preserve current demo ergonomics and testability without introducing a real remote app-server dependency yet.

**Non-Goals:**
- Redesigning the message contract or JSON schemas.
- Solving full agent orchestration, repository inspection, or artifact authoring in this change.
- Wiring terminal and GUI hosts in the same slice.
- Replacing the broader brainstorming workflow defined in `skills/brainstorming/SKILL.md`.

## Decisions

### Decision: Introduce a backend-side session runtime for structured question flow

Add a dedicated runtime module that stores:
- the question catalog or flow definition
- the current session state
- the active question id
- the accumulated normalized answer history

The runtime will expose simple operations such as:
- create/start a session
- return the initial `question`
- accept a normalized `answer`
- return the next `question`, `summary`, or `artifact_ready`

This keeps sequencing out of the browser while still allowing the existing demo data to be reused in development.

### Decision: Keep the browser host focused on rendering and normalization

The browser host should continue to:
- render the current `question`
- normalize the user submission into an `answer`
- send the normalized payload back to the backend

It should stop:
- storing the question tree
- deciding which question comes next
- synthesizing completion messages locally

This preserves the current thin-host direction already defined by the archived change.

### Decision: Reuse the shared structured-host helpers, but stop using browser-side branching entry points

`structured-host.cjs` already contains valuable shared logic for rendering and answer normalization. This change should continue to reuse that code in the browser, but the server/runtime should become the only place that advances session state.

If a clean split is needed, the shared module can be refactored into:
- renderer/normalization helpers used by the browser
- session/branching helpers used only by the backend runtime

The key constraint is behavioral, not cosmetic: the page must no longer act as the branching engine.

### Decision: Bootstrap the demo through backend-owned initial state

The browser demo still needs an initial message to render. The backend should therefore seed the page with the current session's first `question`, either by:
- serving bootstrap data with the page, or
- pushing it immediately through the existing WebSocket channel

The simplest approach should be chosen, but the source of truth must remain backend-side.

### Decision: Verify the runtime boundary with focused server tests

The new tests should prove:
- the initial question originates from the backend/runtime
- submitting an `answer` produces the next backend message
- the browser no longer requires a local `questions` tree to move forward

This is more important than adding more schema tests, because the current risk is runtime drift, not contract syntax.

## Risks / Trade-offs

- **Risk: Shared module boundaries stay blurry** -> Mitigation: allow incremental extraction, but enforce the runtime boundary in behavior and tests.
- **Risk: Demo bootstrapping becomes more complicated** -> Mitigation: prefer a simple in-process runtime and bootstrap mechanism before any external integration.
- **Risk: Browser and backend normalization diverge** -> Mitigation: keep answer normalization in one shared place and ensure tests cover the end-to-end submit path.
- **Risk: This change accidentally expands into full app-server integration** -> Mitigation: keep the scope to the local brainstorm server and browser demo only.

## Migration Plan

1. Introduce a backend-side structured brainstorming session runtime using the existing demo flow data.
2. Update the demo page so it renders the active backend message instead of embedding a local branching tree.
3. Route normalized browser answers back to the runtime and emit the next backend message over the existing transport.
4. Update tests to cover initial question bootstrap and answer-driven runtime transitions.
5. Leave terminal and GUI host integration for later follow-up changes.

Rollback is straightforward: the previous local flow demo can be restored if the runtime bootstrap path proves unstable.

## Open Questions

- Should the first implementation bootstrap the initial `question` through inline page data or an immediate WebSocket push?
- Do we want a dedicated runtime module file, or should the first slice keep the runtime inside `server.cjs` and extract later if it grows?
