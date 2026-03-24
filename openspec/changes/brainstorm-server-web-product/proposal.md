## Why

`brainstorm-server` 现在已经能支撑本地 visual companion 和结构化 demo，但它还不是一个真正给最终用户使用的完整 Web 产品。当前实现仍然依赖“浏览器展示 + 终端对话”的 companion 模式、全局单例 demo runtime，以及只到 `summary` 为止的演示流，无法承担 browser-first 的完整 brainstorming 体验。

## What Changes

- Promote `brainstorm-server` from a browser companion into a browser-first Web brainstorming product that can complete a full structured session inside the page.
- Add session-scoped backend orchestration so each browser session has isolated runtime state, resumable history, and browser-native answer flow.
- Add real artifact production and delivery so sessions can end with persisted `summary` or `artifact_ready` results instead of demo-only completion.
- Add a productized Web UI that hides protocol/debug metadata, shows progress/history/results, and no longer requires the terminal as the primary user interaction channel.
- Preserve the existing structured message contract as the transport boundary while extending the server from “newest HTML file renderer” toward a real session-driven Web app.

## Capabilities

### New Capabilities
- `brainstorm-web-session-management`: Defines creation, isolation, persistence, and resumption of browser brainstorming sessions.
- `brainstorm-web-ui`: Defines the browser-first user experience for asking, answering, reviewing history, and completing a brainstorming session without terminal dependence.
- `brainstorm-web-artifacts`: Defines how completed brainstorming sessions persist summaries and real output artifacts for browser retrieval.

### Modified Capabilities
- `structured-brainstorming-runtime`: Extend the runtime from a local demo/runtime proof to a session-scoped backend service suitable for a real Web product.

## Impact

- Affects `skills/brainstorming/scripts/server.cjs`, `structured-runtime.cjs`, `structured-host.cjs`, `structured-demo.html`, and the launch/runtime scripts around `brainstorm-server`.
- Adds product-level session and artifact state rather than a single in-memory demo flow.
- Requires new browser-facing routes or message endpoints, UI shell behavior, and end-to-end verification for isolated sessions and artifact delivery.
