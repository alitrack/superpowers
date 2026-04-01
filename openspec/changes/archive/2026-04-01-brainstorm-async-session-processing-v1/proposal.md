## Why

当前 browser brainstorming 的提交流程仍然是同步请求等待 runtime 完成下一步。这对真实脑暴场景不成立：问题生成、分支收敛、文章草稿生成本身就可能耗时较长，用户不可能一直停留在页面上等待；一旦离开、刷新、服务重启或线程失效，现状就容易表现为超时、误报 404、或用户无法判断当前是否还在处理中。

现在需要把脑暴会话从“同步阻塞式问答”改成“可持久化的后台处理任务”。这样 UI 才能继续做薄壳宿主，Codex + skills 负责真实推理，而用户可以安全地离开页面、稍后回来继续，不会因为一次长耗时 turn 就丢失流程。

## What Changes

- Add durable background processing for browser brainstorming session creation and answer submission so long-running runtime turns do not require an open blocking HTTP request.
- Persist explicit session processing state, pending job metadata, last completed message, and recoverable runtime progress so the browser can reopen an in-flight session and understand whether it is still running, completed, or failed.
- Add browser-readable status refresh behavior so the UI can show “processing / completed / failed” without faking success, silently timing out, or forcing the user to keep the tab open.
- Reclassify API errors so timeout/runtime failures are surfaced as server/runtime errors instead of generic `404`.
- Keep existing thread recovery behavior, but integrate it into the background execution path so restart or stale thread recovery does not depend on a single synchronous submit round-trip.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `brainstorm-web-session-management`: change session lifecycle requirements so browser sessions can enter a durable processing state and be resumed after the user leaves the page.
- `codex-brainstorm-runtime`: change runtime execution requirements so long-running create/submit turns can continue in background and surface structured completion or failure back into the persisted session.
- `brainstorm-web-ui`: change the browser UX so create/submit actions no longer rely on a blocking wait, and reopened sessions can clearly show in-flight progress and later completion.

## Impact

- Affects [server.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/server.cjs), [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs), [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs), and [codex-app-server-client.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-app-server-client.cjs).
- Likely affects request-state UX in [web-app-shell.html](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-app-shell.html) and derived mainstage state in [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs).
- Extends [web-session-manager.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-session-manager.test.js), [web-product.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-product.test.js), and app-server/runtime regression tests around timeout, recovery, and background completion semantics.
