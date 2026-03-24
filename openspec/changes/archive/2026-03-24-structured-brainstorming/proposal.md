## Why

Current brainstorming guidance says to ask one clarifying question at a time, but the repository still lacks a stable interaction contract that product hosts can implement consistently. We need this now because structured brainstorming has already grown beyond chat-only use and now needs a shared protocol for browser, terminal, and GUI hosts.

## What Changes

- Define a structured brainstorming message contract for `question`, `answer`, `summary`, and `artifact_ready`.
- Standardize the supported question types as `pick_one`, `pick_many`, `confirm`, and `ask_text`.
- Define one-question-at-a-time host behavior, where the backend decides branching and the host only renders the active question and collects input.
- Define text-override behavior so users can answer with free text even when the primary UI is structured choice selection.
- Align the current brainstorming demo and future hosts to the same schema-backed transport contract.

## Capabilities

### New Capabilities
- `structured-brainstorming-messages`: Defines the machine-readable message contract for structured brainstorming sessions, including question, answer, summary, and artifact-ready payloads.
- `structured-brainstorming-flow`: Defines one-active-question host behavior, backend-controlled branching, and completion transitions for structured brainstorming sessions.
- `structured-brainstorming-text-override`: Defines how typed input can replace or refine structured selections for `pick_one`, `pick_many`, and `confirm` questions.

### Modified Capabilities
- None.

## Impact

- Affects `skills/brainstorming/` guidance and any host that renders brainstorming questions.
- Affects browser companion demos and future app-server or GUI integrations that need a shared protocol.
- Affects `docs/superpowers/specs/` and `docs/superpowers/schemas/` as the canonical source of contract and schema definitions.
- Will require follow-up changes to host-side parsing, message rendering, and event normalization.
