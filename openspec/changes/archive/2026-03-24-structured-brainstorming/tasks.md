## 1. Contract Source of Truth

- [x] 1.1 Align the structured brainstorming design doc and OpenSpec artifacts so the same message types, question types, and completion semantics are described consistently.
- [x] 1.2 Review the multi-file JSON schemas under `docs/superpowers/schemas/structured-brainstorming/` and fill any remaining gaps needed for host and backend implementation.
- [x] 1.3 Decide where protocol-level debug or provenance metadata belongs so production-facing payloads stay clean by default.

## 2. Host Message Rendering

- [x] 2.1 Refactor the current brainstorming demo to consume schema-aligned `question` messages instead of local hardcoded event structures.
- [x] 2.2 Update the host-side submission flow so user actions emit normalized `answer` messages and completion states render `summary` or `artifact_ready`.
- [x] 2.3 Add host support for all four question types: `pick_one`, `pick_many`, `confirm`, and `ask_text`.

## 3. Answer Normalization and Branching

- [x] 3.1 Implement a normalization layer that resolves obvious shorthand (`1`, `A`, labels, comma-separated lists) into schema-compliant answers.
- [x] 3.2 Implement text-override handling for structured questions, including `text` and `mixed` answer modes.
- [x] 3.3 Move next-question branching decisions out of the frontend and into an agent/backend-facing decision layer that consumes normalized answers.

## 4. Verification and Handoff

- [x] 4.1 Add or update verification coverage for question rendering, normalized answer payloads, summary generation, and text-override paths.
- [x] 4.2 Validate that browser, terminal, and future GUI hosts can all follow the same one-question-at-a-time contract without host-specific branching rules.
- [x] 4.3 Document implementation entry points and expected follow-up work so `/opsx:apply` can begin from a clean apply-ready state.
