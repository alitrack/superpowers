## Context

上一个 change 把 runtime 从“纯手写 prompt”推进到了“注入 brainstorming skill 摘录”。这解决了一部分方向问题，但没有解决用户指出的核心事实：

> 当前并没有真正加载 skills。

这次复核后已经确认：

1. `codex exec` 真实可以在运行时自己读取 skill 文件。
2. 但当前 `brainstorm-server` 并没有要求它这样做。
3. `PRODUCT_BASE_INSTRUCTIONS` 里原本的“不要检查仓库/不要调工具”还会阻止这一步。

所以这不是“再优化一下 prompt wording”的问题，而是 runtime bootstrap 方式错了。

## Goals / Non-Goals

**Goals**

- 让 real app-server / exec 路径明确要求先读取 repo 里的 skill 文件，再产出用户可见问题。
- 把 `using-superpowers` 和 `brainstorming` 明确设为浏览器脑暴阶段的必需 skill 集合。
- 保留现有 `question / summary / artifact_ready` host contract。
- 让旧的 skill excerpt 从“主策略来源”降级为“文件读取失败时的 fallback”。
- 用测试证明真实 bootstrap 指令已经进入 runtime。

**Non-Goals**

- 不把整个 skill 的后续工程动作直接搬进 web host。
- 不在这次 change 里重做 UI 或分支树。
- 不在这次 change 里引入新的 transport schema。

## Decisions

### Decision: Real runtime must explicitly read repository skill files

在 real path 中，prompt / developer instructions 不再只说 “be grounded in the skill”，而是明确要求：

- 先读取 `skills/using-superpowers/SKILL.md`
- 再读取 `skills/brainstorming/SKILL.md`
- 读取后再产出第一条用户可见 structured message

**Why this over继续依赖摘录?**

- 摘录只能证明“我们把一些文字塞进了 prompt”
- 不能证明 runtime 真正看到了当前 repo 的 skills，也不能证明它遵守了 skill 的 bootstrap 纪律

### Decision: Repo inspection is allowed only for required skill files

当前基础约束过严，会把真实 skill 加载也挡掉。新的做法是：

- 允许读取 repository files，但范围先限定为“加载 required skill files”
- 除此之外，仍然禁止无关 repo inspection
- 如果用户明确要求实现/文件分析，再放开到正常 repo inspection

**Why this over完全放开工具?**

- 用户要的是隐藏 Codex/CLI 的产品，不是让后端到处乱读仓库
- 这里要放开的只是 skill bootstrap 必需权限，不是 unrestricted repo exploration

### Decision: App-server and exec both receive explicit skill bootstrap

`exec` 每一轮都是新进程，所以每次都必须重新收到 bootstrap 指令。  
`app-server` 线程会持续存在，所以：

- `startThread` 的 base/developer instructions 必须要求先加载 skills
- 首轮 `turn/start` prompt 也必须包含同样的 bootstrap 约束
- follow-up turn prompt 继续提醒“如果本线程尚未加载，则先加载”

### Decision: Embedded excerpt remains as fallback only

保留当前 `loadBrainstormingSkillPolicy()`，但它的定位改变为：

- 作为 fallback excerpt
- 帮助 runtime 在工具不可用时仍保留一层安全约束
- 不再作为“已经使用 skill”的主要证据

## Risks / Trade-offs

- [Risk: prompt 变长] -> Mitigation: skill bootstrap 指令聚焦在两个具体文件，不再泛化成大段策略解释
- [Risk: runtime 误把 skill loading 暴露给用户] -> Mitigation: 明确要求不要把内部 skill/file loading 过程显示给用户
- [Risk: repo inspection 范围悄悄扩大] -> Mitigation: 在 base instructions 里只允许 required skill files，其他 repo inspection 仍需用户显式请求
- [Risk: fallback excerpt 与真实 skill 内容重复] -> Mitigation: 明确标成 fallback，不把它当主 ground truth

## Migration Plan

1. Add required skill bootstrap instructions and required file list to runtime adapter.
2. Update product base instructions so skill bootstrap repo reads are explicitly allowed.
3. Inject the bootstrap instructions into app-server developer instructions and exec/app-server turn prompts.
4. Add regression tests for exec prompt content and app-server thread bootstrap instructions.
5. Run targeted tests, full brainstorm-server suite, and a real smoke using the live server.

## Open Questions

- 后续是否要把“required runtime skills”抽成独立配置，而不是硬编码在 runtime adapter 中？
- 如果将来 browser brainstorming 引入别的 process skill，是否需要把 skill bootstrap 变成可组合列表？
