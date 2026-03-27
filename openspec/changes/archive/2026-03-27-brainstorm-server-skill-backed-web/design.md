## Context

上一个阶段已经把 Web 版 session create 改成支持 `initialPrompt`，也让 seeded session 能从正式脑暴第一问开始。但当前产品仍然不对，因为：

1. “抛出本轮问题”的入口并不是稳定可见的主入口。页面如果已有旧 session，会直接加载旧线程，用户看不到明显的新题入口。
2. `codex-runtime-adapter.cjs` 里的脑暴策略主要来自手写 prompt 和状态机，而不是当前仓库中真正的 `skills/brainstorming/SKILL.md`。

这意味着产品仍然更像“结构化脑暴壳 + 自定义 prompt”，而不是“skill-backed web brainstorming product”。

## Goals / Non-Goals

**Goals:**
- 让 Web 页始终显示一个明确的新脑暴入口，旧 session 不能盖住它。
- 让 Codex-backed brainstorming turn 明确受 `skills/brainstorming/SKILL.md` 约束。
- 在不破坏现有消息 contract 的前提下，把 skill 作为主策略源，把手写 runtime 退到兼容/回退层。
- 用测试证明：稳定入口存在、skill 内容真的进入了 prompt 组装。

**Non-Goals:**
- 不在这次变更里重做整个 UI 视觉主题。
- 不把整个 brainstorming skill 的所有“写 design doc / commit / plan”后续动作都搬进 Web 产品。
- 不在这次变更里处理多人协作、树状分支或 deep research。

## Decisions

### Decision: 新脑暴入口必须常驻可见，而不是只在“无 session”时显示

页面保留 recent sessions，但把“Start a new brainstorm”入口做成主舞台内的常驻 composer。用户不必先清空旧 session，也不必猜是不是要点 sidebar 按钮。

**Why this over继续依赖 New Session 按钮?**
- 侧边按钮是动作，不是明确的产品入口。
- 有旧 session 时，主舞台如果直接显示旧线程，用户会自然以为系统没有“抛题开始”的入口。

### Decision: 运行时显式加载当前 brainstorming skill 内容作为 prompt ground truth

在 server/runtime 层读取当前 `skills/brainstorming/SKILL.md`，提取与“脑暴对话阶段”相关的内容，作为 Codex-backed runtime 的 skill policy 输入。

**Why this over只在 prompt 里提一句“use brainstorming skill”?**
- 仅靠名称触发不够可验证，调试时也无法证明当前 skill 内容确实进入了模型上下文。
- 直接读取当前 skill 文件，至少能保证 prompt ground truth 与仓库现状同步。

### Decision: Skill 注入做“对话阶段裁剪”，不直接把整个 skill 原文硬塞进每一轮

`skills/brainstorming/SKILL.md` 里既有脑暴对话规则，也有写 spec、commit、invoke writing-plans 等后续工程动作。Web runtime 只抽取与“Explore / Ask / Propose / Present design sections”相关的部分，并补充 host-specific 限制：

- 一次只输出一个正式问题
- 输出必须落在 `question/summary/artifact_ready`
- 不要在 Web session 中自行写文件或提交代码

**Why this over全文注入?**
- 全文注入会把产品对话和 repo 工程动作混在一起。
- 用户要的是用当前 skill 的脑暴能力，不是让后端在 Web session 里突然开始写文档和 commit。

### Decision: 手写 phase state 继续保留，但只做 host/runtime plumbing，不再自定义脑暴策略

现有 `phase / nextLearningGoal / candidateDirections / decisionTrail` 状态仍然保留，用于 resume、browser contract 和 artifact 生成；但“下一问问什么”的核心策略改由 skill-grounded prompt 决定。

**Why this over删除现有状态机?**
- 这些状态仍然对 Web host 和 resume 很重要。
- 真正该退位的是“自写脑暴策略”，不是会话状态模型本身。

## Risks / Trade-offs

- [Risk: skill 内容注入后 prompt 过长] -> Mitigation: 提取对话阶段关键片段并缓存，而不是每次全文拼接。
- [Risk: skill 中的工程后续动作污染 Web 对话] -> Mitigation: 明确裁剪内容，并在运行时加 host-specific 禁止条款。
- [Risk: 常驻新题入口和当前线程同时出现导致页面杂乱] -> Mitigation: 让新题入口是紧凑但显著的 composer，当前线程仍占主阅读区域。
- [Risk: 现有 fake runtime 与真实路径行为更不一致] -> Mitigation: 继续把 fake runtime 定位为 contract/test fallback，不把它伪装成真实体验。

## Migration Plan

1. 新增 skill policy loader，从 `skills/brainstorming/SKILL.md` 读取并裁剪脑暴对话规则。
2. 修改 app-server / exec prompt builder，注入 skill policy。
3. 修改 Web shell，增加常驻新题 composer。
4. 增加测试，验证 skill policy 进入 prompt，且常驻入口不被旧 session 遮挡。
5. 做真实 smoke，检查新题入口和首轮问题都符合预期。

## Open Questions

- 是否需要在 UI 上显式显示“当前后端策略来自 brainstorming skill”之类的调试信息，仅用于开发模式？
- 后续是否要把 skill 裁剪规则提取成独立文件，避免直接在 runtime adapter 内硬编码文本筛选？
