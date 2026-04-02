## Why

当前 browser brainstorming 的产品层做了过多额外干预：前端默认强制 `full_skill`，把所有 artifact session 都拉进 `spec -> review -> plan` 流程；导出结果也被包装成统一的“brainstorm result / spec bundle”形态。这会覆盖 `Codex + skills` 本来应该根据需求自然决定的问题流和交付物类型，导致像“写文章”这样的需求也被错误收敛成 spec/plan 包。

现在需要把边界重新拉直：UI 只负责可视化、选择、提交、分支和回看；真实问题生成、收敛逻辑、交付物类型仍由 Codex 和当前 skills 决定。这样既能保留决策树画布的直观性，也能避免产品壳层再次篡改需求语义。

## What Changes

- Stop the browser shell from forcing `workflowMode: full_skill` for ordinary sessions and let the backend default or an explicit caller decision determine the workflow path.
- Keep explicit full-skill orchestration available for API callers or future advanced entry points, but make it opt-in instead of the browser default.
- Make browser exports and completion views reflect the runtime's real deliverable shape and title instead of always wrapping results in generic brainstorm/spec-plan packaging.
- Keep the main canvas focused on question/answer/branch/result semantics while moving workflow stage chrome to the left rail and keeping view controls lightweight inside the graph header.
- Preserve visible graph continuity when history is collapsed so the first visible node still connects from the topic root.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `brainstorm-mainstage-ui`: change the browser shell so workflow chrome stays secondary and the graph remains a thin, branch-friendly host for the active runtime path.
- `brainstorm-skill-workflow-orchestration`: change browser session startup so full-skill orchestration is explicit rather than forced by the UI.
- `brainstorm-web-artifacts`: change artifact/result exports so they preserve the runtime deliverable instead of injecting spec/plan bundle semantics unless the session actually ran in full-skill mode.

## Impact

- Affects [server.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/server.cjs), [web-app-shell.html](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-app-shell.html), [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs), and [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs).
- Likely affects artifact/result markdown shaping in [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs) and completion copy in [structured-host.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/structured-host.cjs).
- Extends [web-product.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-product.test.js), [web-session-manager.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-session-manager.test.js), and [web-mainstage-state.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-mainstage-state.test.js).
