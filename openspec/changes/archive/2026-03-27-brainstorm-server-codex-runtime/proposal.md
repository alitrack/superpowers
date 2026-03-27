## Why

`brainstorm-server` 现在已经有了可用的 Web 产品壳，但它内部仍然运行固定的 `structured-demo` 问题树。用户看到的是“像产品的界面”，实际后端却不是在做真正的 brainstorming，这使当前实现无法承担真实需求澄清、持续追问、以及与后续规划/产物生成衔接的工作。

现在需要把现有 `/app` 从 demo runtime 升级为真实 Codex brainstorming runtime：浏览器继续负责友好交互，后端改为驱动真正的 Codex 会话，并把结构化问题、总结和产物以现有 transport contract 输出给前端。

## What Changes

- Replace the hardcoded `structured-demo` runtime behind `/app` with a real Codex-backed brainstorming session runtime.
- Add a backend adapter layer that prefers `codex app-server` and can fall back to `codex exec` when app-server is unavailable.
- Persist enough Codex session state to resume a browser brainstorming session after reload and continue from the current active question instead of restarting from a fake flow root.
- Translate backend-produced structured prompts into the existing `question`, `summary`, and `artifact_ready` transport contract without exposing CLI or protocol details in the product UI.
- Keep the current legacy companion mode and structured-demo contract tests as compatibility/developer paths while the real runtime becomes the browser-first default.

## Capabilities

### New Capabilities
- `codex-brainstorm-runtime`: Defines how brainstorm-server starts, resumes, and advances a real Codex-backed brainstorming session while keeping the browser host renderer-only.
- `codex-brainstorm-backend-selection`: Defines app-server-first backend selection, `codex exec` fallback behavior, and how degraded backend mode is persisted per session.

### Modified Capabilities
- `structured-brainstorming-flow`: Extend flow completion and resume behavior from demo-only sequencing to real backend-owned interactive brainstorming sessions.
- `structured-brainstorming-runtime`: Extend the runtime boundary from an in-process demo flow to a provider-backed runtime that can survive reloads and continue external turns.

## Impact

- Affects `skills/brainstorming/scripts/server.cjs`, `web-session-manager.cjs`, `structured-runtime.cjs`, and will likely add a dedicated Codex adapter/runtime module under `skills/brainstorming/scripts/`.
- Requires session persistence to store backend mode, backend session identifiers, normalized answer history, and current active message.
- Adds integration and headless tests for real runtime orchestration, backend fallback selection, and browser-session resume behavior.
