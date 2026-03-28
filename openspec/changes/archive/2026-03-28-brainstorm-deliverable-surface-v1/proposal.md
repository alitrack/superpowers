## Why

当前 browser 版 brainstorming 在“完成态”上仍然像工程过程的尾巴，而不是用户真正要拿走的结果。页面虽然能显示 `spec + plan` bundle 和 supporting cards，但成熟的 brainstorming deliverable 仍然没有成为主角，用户也不能直接把这轮结果导出成清晰可复用的 `md/json`。

现在需要把完成态从“bundle 预览”收口为“结果交付面板”：用户结束一轮脑暴后，第一眼看到的是推荐结论、关键取舍、风险和下一步，而不是自己再去猜应该打开哪个文件。

## What Changes

- Rework the browser completion surface so the mature brainstorming deliverable becomes the primary result view instead of a secondary bundle preview.
- Persist and expose a normalized finished-result payload for completed sessions so the UI can render sectioned outcome cards without reparsing markdown blobs.
- Add browser-facing result export endpoints for markdown and JSON while keeping generated spec/plan bundle files available as supporting artifacts.
- Ensure full-skill `artifact_ready` completion messages carry the mature deliverable plus supporting generated-artifact metadata so completed sessions are self-describing when revisited.
- Keep the current new-brainstorm entry and canvas structure, but make spec/plan outputs supporting material inside the finished-result experience rather than the only visible completion object.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-mainstage-ui`: Change the completion mainstage from bundle-first presentation to an outcome-first finished-result surface with clear supporting package context.
- `brainstorm-web-artifacts`: Change completed-session persistence and retrieval so a browser user can review and export the finished result as markdown and JSON, not only open the current artifact blob.
- `brainstorm-finished-deliverable`: Change completion payload expectations so `summary` and `artifact_ready` expose the normalized mature deliverable needed by the result surface and exports.

## Impact

- Affects `skills/brainstorming/scripts/web-mainstage.cjs`, `web-app-shell.html`, `web-session-manager.cjs`, and `server.cjs`.
- Adds or expands browser/API tests for result-surface rendering and export retrieval.
- Reuses the existing finished-deliverable synthesis instead of introducing a new brainstorming phase or protocol family.
