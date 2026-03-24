# Structured Brainstorming Interaction Contract

**Date:** 2026-03-24  
**Status:** Draft  
**Scope:** `skills/brainstorming/`, visual companion hosts, app-server style GUI hosts, parser-driven terminal hosts

## Problem

Current brainstorming guidance is correct at the workflow level: explore context, ask one clarifying question at a time, then converge on a design. What is still missing is a stable interaction contract for productized hosts.

The desired UX is not "agent dumps a paragraph of questions." It is:

1. User submits an initial need
2. Agent analyzes it internally
3. System shows exactly one formal question
4. User answers through a structured control or plain text
5. Agent decides the next question or ends with a summary/artifact

The host should feel simple. The protocol can be rich; the UI should not.

## Goals

- One active answerable question at a time
- Structured-first questions: `pick_one`, `pick_many`, `confirm`, `ask_text`
- Plain text always available as an override path
- Branching controlled by the agent/backend, not hardcoded in the UI
- Clean transition from questioning to `summary` or final artifact
- Same logical contract across browser, terminal, and future GUI hosts

## Non-Goals

- Exposing chain-of-thought or internal expert analysis to the user
- Locking the system to visual-only interaction
- Treating free text as a failure case
- Encoding implementation-plan semantics into the basic question contract

## Core Model

**Internal behavior:** the agent may inspect repo context, user constraints, earlier answers, and protocol state before choosing the next question.

**External behavior:** the user sees only:

- a short explanation
- one question
- one answer surface

The host is a renderer plus input collector. The backend owns sequencing, interpretation, and stopping conditions.

## Question Types

### `pick_one`

Use when one decision must be selected now.

Examples:
- "这轮 brainstorming 先收敛什么？"
- "你最在意哪个方案维度？"

### `pick_many`

Use when multiple constraints, goals, or inputs may all apply.

Examples:
- "当前有哪些硬约束？"
- "这些方向里哪些都值得继续保留？"

### `confirm`

Use when the system wants explicit confirmation of an inferred understanding or next step.

Examples:
- "我的理解是先做需求澄清，再谈设计，对吗？"
- "是否基于当前答案直接输出方案建议？"

### `ask_text`

Use when the answer cannot be reliably reduced to options, or when a custom explanation is the primary value.

Examples:
- "请补充当前最真实的痛点。"
- "如果上面的选项都不对，你希望系统怎么理解这个需求？"

## Question Payload

```json
{
  "type": "question",
  "questionType": "pick_one",
  "questionId": "root_goal",
  "title": "这轮 brainstorming 你最想先收敛什么？",
  "description": "先锁定主目标，后面的提问会按这个分支推进。",
  "options": [
    { "id": "requirements", "label": "需求澄清", "description": "先明确目标、范围和约束" },
    { "id": "solution", "label": "方案设计", "description": "先比较多个方案并收敛推荐" },
    { "id": "execution", "label": "执行计划", "description": "方向基本明确，先拆下一步动作" }
  ],
  "allowTextOverride": true,
  "textOverrideLabel": "直接输入其他答案",
  "metadata": {
    "step": 1,
    "path": ["root"],
    "expectsArtifact": "summary"
  }
}
```

### Field Rules

- `type` is always `"question"` for answerable prompts.
- `questionType` must be one of `pick_one | pick_many | confirm | ask_text`.
- `questionId` must be stable within the current session.
- `title` is the formal question.
- `description` explains why this question is being asked.
- `options` is required for `pick_one` and `pick_many`, optional for `confirm`, and omitted for `ask_text`.
- `allowTextOverride` should default to `true` for `pick_one`, `pick_many`, and `confirm`.
- `metadata` is transport-safe state; production UI may hide it.

## Answer Payload

```json
{
  "type": "answer",
  "questionId": "root_goal",
  "answerMode": "option",
  "optionIds": ["solution"],
  "text": null,
  "rawInput": "2"
}
```

### `answerMode`

- `option`: one structured option resolved
- `options`: multiple structured options resolved
- `confirm`: boolean-like confirmation resolved
- `text`: no option match, use text as authoritative answer
- `mixed`: option selection plus free-text refinement

### Interpretation Rules

For `pick_one`:

- click/tap on one option -> `answerMode: "option"`
- text like `1`, `A`, or exact option label -> normalize to the same structured answer
- non-matching text -> `answerMode: "text"`

For `pick_many`:

- multiple selected options -> `answerMode: "options"`
- text like `1,3` or `A,C` -> normalize to `optionIds`
- option selection plus extra note -> `answerMode: "mixed"`
- non-matching text -> `answerMode: "text"`

For `confirm`:

- explicit yes/no buttons -> `answerMode: "confirm"`
- text like `yes`, `no`, `是`, `不是` -> normalize to confirm semantics
- text like `是，但...` -> `answerMode: "mixed"`

For `ask_text`:

- free text is primary
- host may still provide suggestion chips, but they are optional accelerators, not the contract

## Text Override Policy

Text override is not a fallback error path. It is a first-class answer channel.

The backend should apply this order:

1. Try exact structured match
2. Try lightweight normalization (`1`, `A`, option label, comma-separated lists)
3. If ambiguous, ask a short `confirm`
4. If clearly custom, preserve the text and continue

The system should never force the user to choose an option when the text already provides a better answer.

## Turn Lifecycle

```text
user_request
  -> internal_analysis
  -> question
  -> answer
  -> branch_decision
  -> question | summary | artifact_ready
```

### Host Rules

- Only one active question is rendered at a time
- Previous answers may be shown as read-only history
- Once an answer is submitted, the host waits for the next backend message
- The host does not decide branching
- Browser and terminal hosts should accept both structured selections and typed answers

## Completion Payloads

### `summary`

Use when the session has converged enough to restate the chosen path but no file artifact exists yet.

```json
{
  "type": "summary",
  "text": "起始目标=方案设计; 分支焦点=可维护性; 输出期望=推荐方案",
  "path": ["root_goal", "solution_focus", "solution_output"],
  "answers": [
    { "questionId": "root_goal", "answer": "方案设计" },
    { "questionId": "solution_focus", "answer": "可维护性" },
    { "questionId": "solution_output", "answer": "推荐方案" }
  ]
}
```

### `artifact_ready`

Use when the questioning phase is over and the system has produced a concrete output.

```json
{
  "type": "artifact_ready",
  "artifactType": "markdown",
  "title": "brainstorm-summary.md",
  "path": "docs/superpowers/specs/...",
  "text": "已根据本轮选择生成结构化结果。"
}
```

## Recommended State Machine

1. Receive user need
2. Perform hidden expert analysis
3. Emit one structured question
4. Accept structured answer or text override
5. Normalize answer
6. Decide whether more information is needed
7. If yes, emit the next question
8. If no, emit `summary` or `artifact_ready`

## Schema Artifact

The current machine-readable schemas live at:

- `docs/superpowers/schemas/structured-brainstorming/message.schema.json`
- `docs/superpowers/schemas/structured-brainstorming/question.schema.json`
- `docs/superpowers/schemas/structured-brainstorming/answer.schema.json`
- `docs/superpowers/schemas/structured-brainstorming/summary.schema.json`
- `docs/superpowers/schemas/structured-brainstorming/artifact-ready.schema.json`

`message.schema.json` is the top-level union schema. The other four files define the concrete message shapes.

## Design Constraints

- Formal questions should be structured even if the surrounding explanation is prose
- One question means one answerable decision, not one screen full of unrelated asks
- `pick_many` should stay bounded; if everything is selectable, the question is underspecified
- `confirm` is for validation, not for sneaking in a second substantive question
- The protocol should preserve provenance internally, but production UI should not expose debug markers by default

## Implications for Future Implementation

- The current demo proved browser-side one-question flow and event capture
- The next real implementation should move branching logic out of the frontend and into the agent/backend
- The frontend should become a generic renderer for `question`, `summary`, and `artifact_ready`
- The parser should support both click answers and typed answers under the same answer contract

## Implementation Entry Points

- `skills/brainstorming/scripts/structured-host.cjs`
  Shared protocol-aware host module. Covers question rendering, answer normalization, summary generation, and reusable branching helpers.
- `skills/brainstorming/scripts/structured-demo.html`
  Repo-tracked browser demo that consumes schema-aligned `question` messages and emits normalized `answer` / `summary` messages.
- `skills/brainstorming/scripts/helper.js`
  Low-level browser bridge for WebSocket event delivery and indicator updates.
- `skills/brainstorming/scripts/server.cjs`
  Injects the helper and structured host scripts into served pages and persists schema-aligned user events in `.events`.
- `tests/brainstorm-server/server.test.js`
  Integration coverage for server injection, event persistence, and file-watching behavior.
- `tests/brainstorm-server/structured-host.test.js`
  Unit coverage for question rendering, normalization, summary generation, and text-override behavior.

## Expected Follow-Up Work

- Replace demo-local branching with a real backend or agent decision source that emits the next `question` message.
- Add a real `artifact_ready` producer once the questioning flow starts generating tracked output files.
- Decide whether `confirm` stays option-based everywhere or gets a dedicated boolean control in some hosts.
- Wire the same shared contract into terminal and future GUI hosts so they stop depending on local heuristics.
