## Context

上一条 change 已经把 `brainstorming` 浏览器产品从 supporting cards 推进到了 branch/workbench 语义，但它停在了“数据模型升级，主形态未升级”的中间态：

- `web-mainstage.cjs` 已有 `pathNodes / contextNodes / resultNodes`
- 页面也有 `Decision Tree / Active Node / Context` 的文案
- 但实际布局仍然是固定三栏 panel，树只是左栏列表
- 当前问题仍然以独立表单面板存在，不是真正在树上的 active node

这正是用户当前最不满意的点。现在不能再把“有 tree 数据结构”当成“做成了决策树”，而要把“树是主画布”落实为 UI 主形态。同时，这轮还必须补上请求反馈：真实 runtime 首轮建会话和后续提交比较慢，如果没有 pending / disabled / error 状态，产品会继续看起来像坏掉的半成品。

## Goals / Non-Goals

**Goals:**

- 把主界面改成真正的决策树主画布，而不是三栏 dashboard。
- 让当前 active question 成为树上的 active node，而不是脱离树结构的中心表单面板。
- 让父路径、当前节点、相邻方向、完成节点之间具有可见的树关系，而不是按组罗列。
- 把详情/说明降级为次级 inspector，不再与主树平分版面。
- 为 session 创建和答案提交提供清晰的 pending、disabled、error 反馈。

**Non-Goals:**

- 不实现自由拖拽白板、任意节点创建、手动画线或无限画布编辑器。
- 不引入新的持久化 tree schema；仍从现有 session/workflow/provenance 派生。
- 不重做 backend sequencing 或新增 transport message 类型。
- 不把 research workspace/governance/workbench 重新并入 brainstorming 主产品。

## Decisions

### Decision: 树画布必须占据主舞台，而不是作为左侧 sibling panel

画面重心改为一个中央 tree canvas：

- root / history / active node / sibling directions / result nodes 都在同一主画布
- inspector/details 只作为右侧次级辅助面板或抽屉
- 新 topic 入口作为次级 dock 停留在边缘区域

**Why this over 继续优化三栏?**

- 三栏本质还是 dashboard 语义，不会被用户理解成“决策树”。
- 只要 active question 不在树上，用户看到的仍然是“表单 + 辅助信息”。

### Decision: Active node 与答题表单绑定在树节点上

当前待回答问题不再是一个独立 panel，而是树上的 active node，表单区域与这个节点同构展示。这样用户可以直接看到：

- 当前节点从哪里来
- 它和上游路径是什么关系
- 它旁边还有哪些 sibling directions

**Why this over 保留中间表单区?**

- 中间独立表单会把树降级成导航栏。
- 用户要的是“沿树推进”，不是“左边看树、右边做题”。

### Decision: 用“派生树几何”而不是“扁平分组列表”渲染 branch context

V1 仍然不引入持久化布局，但前端要把现有 `pathNodes / contextNodes / resultNodes` 投影成树关系：

- 主路径节点形成垂直或斜向主干
- sibling directions 从当前节点分叉
- result nodes 作为终局分支或尾部节点出现

这意味着渲染模型要从“分组列表”升级成“带父子关系和层级位置的 canvas geometry”。

**Why this over 继续渲染 Current Path / Adjacent Directions / Finished Result 三组?**

- 三组列表只是分类，不是树。
- 用户要的是关系可见，而不是标签可见。

### Decision: Inspector 次级化，并且只在选中节点时强化显示

右侧 inspector 保留，但只承担：

- 当前选中节点详情
- supporting package
- completion artifact actions

它不能再与主树等权，也不能再成为主要阅读路径。

**Why this over 继续保留完整右栏内容墙?**

- 右栏内容墙会继续把用户注意力从树上拽走。
- inspector 的职责应该是“解释树”，不是“替代树”。

### Decision: 创建和提交必须显式进入请求中状态

前端在以下行为中必须展示 visible pending state：

- 点击 `Artifact Session`
- 点击 `Summary Session`
- 提交任一问题答案

具体最低要求：

- 按钮禁用
- 文案切换为进行中
- 主舞台显示“正在创建/正在提交/正在等待下一步”
- 请求失败时展示可见错误，而不是静默失败

**Why this over 只做轻量 spinner?**

- 当前最大问题是“用户以为没有反应”。
- 仅有不显眼 spinner 不足以解决认知问题，必须让交互状态清楚可见。

## Risks / Trade-offs

- [Risk: 为了做树画布而引入过重的前端几何系统] → Mitigation: V1 只做派生树布局，不做自由拖拽、缩放持久化或任意连线编辑。
- [Risk: active node 嵌入树后，表单可读性下降] → Mitigation: 让 active node 拥有强化样式和足够内容宽度，但仍保持在树关系内部。
- [Risk: inspector 过度缩小后 completion package 难找] → Mitigation: completion 态允许 inspector 扩展，但仍不能抢占树画布主视觉。
- [Risk: async feedback 修到一半仍然“看起来像无反应”] → Mitigation: 明确验收标准为 disabled + visible status copy + visible error，三者缺一不可。

## Migration Plan

1. 先重构 `web-mainstage.cjs` 的 view model，让它能输出树几何所需的层级/关系信息，而不是仅输出分组节点。
2. 再重写 `web-app-shell.html` 的主舞台，让 tree canvas 成为中心区域，active node 内嵌到树中。
3. 同步把 inspector/details 降级为次级 surface。
4. 加入 create/submit pending/error 反馈，并对慢请求显式锁住按钮与状态文案。
5. 更新针对性测试和浏览器 smoke，确保这轮真正改的是主形态，而不是继续换皮。

## Open Questions

- V1 的树几何更适合“垂直主干 + 横向分支”，还是“中心节点 + 向外展开”的形式？优先选实现稳定且最不容易退化成 dashboard 的一种。
- inspector 最终做固定右栏还是可折叠抽屉？优先选不与主树平权的一种。
