## Context

The repository already has the right brainstorming workflow intent: ask one question at a time, let the user converge gradually, and end with a clear handoff to planning or artifact generation. What is missing is a host-facing contract that can be shared across the browser companion, parser-driven terminal flows, and future GUI or app-server integrations.

Recent exploratory work in this repo produced two useful foundations:

- a prose contract in `docs/superpowers/specs/2026-03-24-structured-brainstorming-contract-design.md`
- machine-readable schema files under `docs/superpowers/schemas/structured-brainstorming/`

The implementation problem is now architectural rather than conceptual: move from ad hoc host-specific events to a shared message model while keeping the user experience simple and one-question-at-a-time.

## Goals / Non-Goals

**Goals:**
- Make `question`, `answer`, `summary`, and `artifact_ready` the canonical message types for structured brainstorming.
- Keep branching decisions in the backend or agent layer so all hosts follow the same path.
- Support `pick_one`, `pick_many`, `confirm`, and `ask_text` with a uniform transport shape.
- Preserve free-text answers as a first-class input path even when the UI is structured.
- Enable the current demo and future hosts to render the same question flow with minimal host-specific logic.

**Non-Goals:**
- Replacing the brainstorming skill's broader workflow with a GUI-only flow.
- Exposing chain-of-thought or internal agent analysis to the user.
- Defining line-by-line implementation details for every host in this document.
- Solving artifact authoring, planning, and implementation execution in the same protocol layer.

## Decisions

### Decision: Use a top-level message union with four concrete message types

The contract will standardize on four top-level messages:
- `question`
- `answer`
- `summary`
- `artifact_ready`

This keeps transport semantics small and stable while still covering the whole questioning lifecycle.

**Why this over host-specific event shapes?**
- Host-specific events couple branching logic to individual renderers.
- Shared message types make browser, terminal, and GUI integrations converge on one protocol.
- A top-level union maps cleanly to JSON Schema and parser validation.

### Decision: Backend owns branching; hosts only render and collect input

Hosts must not decide what question comes next. After a host sends a normalized `answer`, it waits for the next backend message.

**Why this over frontend-defined question trees?**
- Frontend branching duplicates domain logic across hosts.
- Agent/backend ownership allows richer context use: prior answers, repo state, explicit user constraints, and future tool outputs.
- It keeps the protocol stable even when the decision logic evolves.

### Decision: Treat text override as a first-class answer channel

Structured selection is the preferred UX, but text input remains valid for `pick_one`, `pick_many`, and `confirm`.

The normalization pipeline is:
1. exact structured match
2. shorthand normalization (`1`, `A`, labels, comma-separated lists)
3. confirmation on ambiguity
4. custom text preserved when it does not map cleanly

**Why this over forcing users back into options?**
- Real brainstorming often produces answers the designer did not anticipate.
- Forcing option-only answers degrades trust and pushes users into workaround behavior.
- A normalized text path preserves flexibility without abandoning structure.

### Decision: Keep protocol provenance internal by default

The contract will carry identifiers, path data, and normalized answer metadata, but production-facing hosts should not expose debug markers unless explicitly requested.

**Why this over showing raw protocol state?**
- Internal provenance is useful for debugging, summaries, and downstream artifact generation.
- Normal users should see a simple question-and-answer flow, not transport details.

### Decision: Introduce a thin host adapter layer

Each host should implement a thin adapter that:
- renders `question`
- captures selections or text
- emits normalized `answer`
- renders `summary` or `artifact_ready`

The adapter must not contain branching policy.

**Why this over a single monolithic frontend implementation?**
- The repo already spans multiple host styles.
- A thin adapter keeps browser companion demos and future app-server shells aligned without over-coupling their UI code.

## Risks / Trade-offs

- **Risk: Schema and implementation drift** -> Mitigation: treat the OpenSpec specs and JSON schema files as the canonical contract, and align host code to them rather than inventing local payloads.
- **Risk: Text override becomes an escape hatch for every question** -> Mitigation: keep structured selection as the primary UI and use normalization plus confirmation to pull obvious answers back into structured form.
- **Risk: Backend-owned branching increases implementation complexity** -> Mitigation: keep hosts thin and let the backend use explicit question IDs and normalized answers rather than raw event text.
- **Risk: Multiple hosts interpret shorthand differently** -> Mitigation: centralize normalization rules in the backend-facing contract and avoid per-host parsing heuristics where possible.
- **Risk: Completion semantics blur between `summary` and `artifact_ready`** -> Mitigation: reserve `summary` for converged state without a materialized deliverable and `artifact_ready` for concrete output availability.

## Migration Plan

1. Keep the current design doc and schema files as the contract source of truth.
2. Update the dynamic brainstorming demo to consume `question` and emit `answer` / `summary` messages that match the schema.
3. Replace temporary host-side event shapes with schema-aligned payloads.
4. Add a backend or agent orchestration layer that decides the next question instead of relying on hardcoded frontend trees.
5. Extend completion handling to emit `artifact_ready` when the questioning flow creates a real document or output.

Rollback is straightforward at this stage because the current work is additive. Hosts can temporarily fall back to the previous local event format while the adapter layer is being replaced.

## Open Questions

- Should `confirm` remain option-based with explicit yes/no choices in all hosts, or should some hosts support a boolean-native control?
- Should shorthand normalization happen only in the backend, or should hosts also normalize obvious cases before sending `answer`?
- Do we want a separate schema for host-side debug/provenance messages, or should those remain out of the public contract entirely?
