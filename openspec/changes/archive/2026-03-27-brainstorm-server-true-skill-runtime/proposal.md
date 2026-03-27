## Why

当前 `brainstorm-server` 的真实后端路径仍然没有“真正加载 skill”。

现状是：

- runtime 会读取 `skills/brainstorming/SKILL.md` 的一部分文字，拼成 prompt excerpt
- 但 app-server / exec 路径并没有被明确要求去真实读取 `using-superpowers` 和 `brainstorming` 这两个 skill 文件
- 更糟的是，基础指令里还限制了“不要检查仓库/不要调用工具”，这会直接阻断 runtime 在真实会话中加载 skill 文件

结果就是：当前产品只是 “skill-inspired” 或 “skill-backed excerpt”，还不是用户要求的 “真正按当前 skills 跑的 brainstorming web”。

## What Changes

- Add explicit skill bootstrap instructions for real Codex-backed brainstorming turns so app-server and exec sessions must read the repository skill files before producing the first user-facing message.
- Require both `skills/using-superpowers/SKILL.md` and `skills/brainstorming/SKILL.md` as the mandatory runtime grounding set for browser brainstorming sessions.
- Relax the repo-inspection guardrail just enough to allow loading the required skill files, while still forbidding unrelated repo inspection unless the user explicitly asks for implementation or file analysis.
- Keep the existing extracted brainstorming-skill excerpt only as a fallback aid, not as the primary proof of skill loading.
- Add regression coverage proving prompt/bootstrap instructions now require actual repository skill reads in both exec and app-server flows.

## Capabilities

### New Capabilities
- `brainstorm-skill-orchestration`: Covers how real Codex-backed brainstorming sessions load and follow the repository skill files before rendering browser-facing structured questions.

### Modified Capabilities
- `structured-brainstorming-runtime`: The real runtime now must bootstrap from repository skill files before deciding the next user-facing message.

## Impact

- Affects `skills/brainstorming/scripts/codex-runtime-adapter.cjs`
- Affects app-server bootstrap behavior, exec prompt composition, and related tests
- Requires fresh verification that the real runtime can start a session while explicitly permitting only the repo reads needed for skill loading
