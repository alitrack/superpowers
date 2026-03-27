## Context

The repository now has three important pieces in place:

1. A structured brainstorming transport contract covering `question`, `answer`, `summary`, and `artifact_ready`
2. A browser-side structured host renderer with shared normalization logic
3. A local backend runtime that proves backend-owned sequencing for a fixed demo flow

That is enough to validate the protocol, but not enough to claim a complete Web product.

The current server still behaves like a local companion:
- HTML is served from the newest file in a watched directory
- a singleton demo runtime drives all structured sessions
- browser interactions are still conceptually paired with terminal guidance
- completion is mostly `summary`-level, not persisted artifact output

The next step is therefore productization, not more contract work. The system needs to become a browser-first application with per-session state, resumable history, real artifact delivery, and a UI that feels like a product rather than a protocol demo.

## Goals / Non-Goals

**Goals:**
- Deliver a browser-first brainstorming experience that can complete a structured session without requiring the terminal as the main user interaction channel.
- Introduce session-scoped backend state so concurrent browser users do not share one global runtime.
- Persist session history and outputs so a user can resume work and inspect prior results.
- Produce real `artifact_ready` outputs with stored artifacts, not only transient summaries.
- Keep the existing structured transport contract as the boundary between backend orchestration and browser UI.

**Non-Goals:**
- Building a hosted multi-tenant SaaS with authentication, billing, or remote account management in the same slice.
- Replacing the existing visual companion workflow for every internal use case on day one.
- Redesigning the question/answer contract itself.
- Adding deep agent reasoning, repo analysis, or model orchestration behavior in this change beyond the application boundary needed to support them.

## Decisions

### Decision: Treat the complete Web version as a browser-first app, not an expanded companion

The target product should no longer assume:
- browser for visuals
- terminal for conversation

Instead, the browser becomes the primary end-user surface. The terminal companion workflow can remain as a developer/operator mode, but it should no longer define the product shape.

**Why this over continuing to extend the companion model?**
- The current companion design explicitly optimizes for turn-based agent tooling, not end-user product UX.
- A “complete Web version” needs its own loop: enter need, answer questions, review history, receive results, continue.
- Keeping the terminal as the primary text channel would force the product to remain half-demo, half-tooling harness.

### Decision: Introduce session-scoped runtime and persistence

The singleton demo runtime should be replaced by a session-scoped runtime manager. Each session should own:
- session id
- current message
- normalized answer history
- runtime state
- persisted outputs

This state should survive page refresh and support resume/list behavior.

**Why this over the current singleton runtime?**
- The current design broadcasts one shared state to all clients, which is invalid for a real product.
- Session isolation is the minimum viable foundation for browser-first use.
- Persistence enables artifact review, resume, and future integration with richer orchestration.

### Decision: Add application endpoints instead of relying on newest-file HTML serving for the product path

The product path should move to explicit app/session endpoints, for example:
- app shell route
- session creation/resume route
- answer submission route
- artifact retrieval route

The watched-directory HTML mode may remain as a legacy/developer companion path, but it should not remain the primary application interface.

**Why this over continuing to drive everything from watched HTML files?**
- File-watch rendering is suitable for operator-authored demos, not user-owned sessions.
- Product behavior needs explicit session identity and state transitions.
- API-style endpoints make it possible to support history, resume, and artifact retrieval cleanly.

### Decision: Preserve one-question-at-a-time transport, but upgrade the UI shell

The browser UI should still render one active formal question at a time, but it should add product-level structure:
- progress/history panel
- answer submission state
- reconnect/reload resilience
- result/artifact area
- hidden protocol/debug metadata by default

**Why this over reusing the current debug-style renderer as-is?**
- The current host still exposes protocol-oriented metadata and is tuned for internal validation.
- A complete Web version needs a user-facing shell, not just a protocol widget.
- This preserves the contract while changing the presentation to match product expectations.

### Decision: Make `artifact_ready` a real persistence boundary

When a session reaches completion with a concrete output, the backend should:
- persist the artifact
- record its metadata in session history
- emit a real `artifact_ready`
- let the browser open or download the artifact without external tooling

**Why this over stopping at `summary`?**
- A complete brainstorming product needs a durable handoff.
- `artifact_ready` already exists in the contract; not using it leaves the product incomplete.
- Persisted outputs are required for later review and follow-on workflows.

### Decision: Implement this as phased productization, not a single giant rewrite

This change is broad enough that the implementation should be staged:

1. session-scoped runtime and session endpoints
2. browser-first UI shell and browser-native answer loop
3. persisted artifact pipeline and result views

**Why this over a one-shot rewrite?**
- The repo already has working demo infrastructure worth preserving.
- Session/runtime separation is the architectural prerequisite for all later work.
- Phasing keeps each slice testable and reduces risk of broad regressions.

## Risks / Trade-offs

- **Risk: The change becomes too broad to execute cleanly** -> Mitigation: keep the design broad, but implement in strict phases with runtime first.
- **Risk: Legacy companion mode and product mode diverge awkwardly** -> Mitigation: preserve the structured transport contract and isolate routing/runtime responsibilities.
- **Risk: Persistence format becomes a dead end** -> Mitigation: choose a simple session store abstraction so JSON-file storage can later be replaced without rewriting the runtime.
- **Risk: Browser-only UX still leaks protocol/debug concepts** -> Mitigation: define UI-shell responsibilities separately from transport metadata and hide debug markers by default.
- **Risk: Artifact generation stays fake despite new UI work** -> Mitigation: treat real `artifact_ready` persistence as a first-class product milestone, not optional polish.

## Migration Plan

1. Extract session-scoped runtime management from the singleton demo runtime.
2. Add browser-facing session lifecycle and answer-submission endpoints while keeping the current transport contract.
3. Build a browser-first shell that can create/resume sessions and render one active question plus history/results.
4. Add persistent summary/artifact storage and real `artifact_ready` handling.
5. Keep the existing watched-HTML companion flow as a compatibility/developer path until the browser-first product path is proven.

Rollback should be done at the route/runtime layer: the current local companion mode remains available while the product path matures.

## Open Questions

- Should the first persistent session store be file-backed JSON or a lightweight embedded database?
- Do we want browser updates to stay WebSocket-driven end-to-end, or should answers move to HTTP request/response while WebSocket remains optional for push updates?
- Should the legacy watched-directory mode stay permanently as a developer tool, or be removed once the browser-first app is stable?
