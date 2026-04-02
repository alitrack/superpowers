## Why

当前 browser brainstorming 已经支持后台 create / submit，但 session 生命周期仍然不够硬：worker 中断、超时、用户长时间离页、删除或重试交错后，session 仍可能表现为永久 `running`、状态语义混乱、或用户不知道现在该继续等、重试，还是放弃。现在需要把 session 生命周期从“能后台跑”提升到“状态可解释、失败可恢复、晚到结果不会污染当前会话”。

## What Changes

- Add an explicit session lifecycle model for browser brainstorming jobs so create / submit can end in `idle`, `running`, `retryable`, or `cancelled` instead of remaining ambiguously stuck.
- Persist runner lease / heartbeat metadata and last stable session snapshot so orphaned background work can be detected without silently leaving sessions in `running` forever.
- Add idempotent lifecycle actions to retry or cancel a stuck/failed create or submit job without corrupting the frozen current question or latest stable result.
- Ignore late writes from superseded jobs after retry, cancel, or delete so an old worker cannot overwrite a newer session state.
- Surface lifecycle status and recovery affordances in the browser UI so reopened sessions clearly show whether they are still running, need attention, or were cancelled.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `brainstorm-web-session-management`: change session lifecycle requirements so processing state is explicit, stale jobs can be detected, and retry / cancel transitions are durable.
- `codex-brainstorm-runtime`: change runtime execution requirements so timed out or orphaned background turns resolve into retryable lifecycle states instead of leaving the session indefinitely ambiguous.
- `brainstorm-web-ui`: change browser session UX so reopened sessions show actionable lifecycle state and let the user retry or cancel without terminal fallback.

## Impact

- Affects [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs), [server.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/server.cjs), and likely [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs) for lifecycle state, retry, cancel, and stale-job protection.
- Affects [web-app-shell.html](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-app-shell.html) and possibly [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs) for request-state and session-rail lifecycle UX.
- Extends [web-session-manager.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-session-manager.test.js), [web-product.test.js](/mnt/d/wsl2/codex/superpowers/tests/brainstorm-server/web-product.test.js), and related runtime regressions around stale running sessions, retry/cancel actions, and ignored late writes.
