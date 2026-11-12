<div align="center">

# dsh-recent-sessions

**最近会话 · A Recent sessions sheet for the DeepSeek Harness sidebar.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2f7dd1.svg)](LICENSE)
![Platform: DSH Web / Desktop](https://img.shields.io/badge/DSH-web%20%7C%20desktop-1f2937.svg)

</div>

> **English** — A sidebar plugin for DeepSeek Harness. One extra row above Settings opens a sheet over the workspace list: the latest sessions by last activity, click a row to switch, collapse the sheet and scroll the sidebar to that session's workspace. **Subagent sessions are the point**: fold them into their main session (the main row ranks by the newest activity anywhere in its subtree and expands in place), hide them, or list them on their own row — chosen with a switch in the sheet that saves back to the profile. A second switch limits the list to the last 1 / 7 / 30 days. The sheet spans the sidebar column and paints an opaque surface.

## English quick start

Install from the Harness **Plugins** page → **Add plugin**:

```text
github:Sunshow/dsh-recent-sessions

# or pin a version
github:Sunshow/dsh-recent-sessions#v0.1.0
```

Then open the switch for `dsh-recent-sessions` in the installed list. The repository ships the plugin files as-is; nothing needs building.

Find the entry row above **Settings** in the sidebar: `最近会话 · Recent sessions  <count>`. Click it, pick a session; the sheet closes and the sidebar scrolls to that session's workspace row (expanding the group first when it is collapsed).

| Setting | Default | Meaning |
| --- | --- | --- |
| `subagentMode` | `fold` | `fold` / `hide` / `separate` — see below |
| `maxItems` | `12` | rows in the list (3–50) |
| `maxAgeDays` | `0` | time window: `0` unlimited, `1`, `7`, `30` |
| `panelOverhang` | `0` | extra px the sheet reaches past the sidebar (0–320) |
| `closeOnPick` | `true` | collapse the sheet after a row opens a session |
| `showWorkspace` | `true` | show the workspace name on each row |
| `defaultCollapsed` | `true` | start with the sheet closed |
| `refreshMs` | `30000` | relative-time refresh interval |

Subagent handling (the switch at the top of the sheet, saved through `POST /api/dsh-recent-sessions/config` into the profile's `cordis.patch.yml`):

| Mode | What the list shows | Ranking |
| --- | --- | --- |
| **fold** (default) | main sessions only, each with an `N 个子代理` count and a `⌄` to expand | newest activity in the whole subtree |
| **hide** | no subagent rows at all | each main session's own activity |
| **separate** | one row per subagent session, marked `子代理` | each row's own activity |

Limitations: archived sessions are not listed (they stay in the sidebar's archive); locating the sidebar row relies on the host's `data-row-key` markers, so it degrades to "opens the session only" if the host changes them; verified on macOS Desktop with DSH 0.2.2.

---

## 中文说明

**侧栏多一行「最近会话」，随时回到刚才的会话；子代理会话按你的偏好折叠、隐藏或单独列出。**

DeepSeek Harness（DSH）侧栏插件。工作区列表下方、设置上方多一行「最近会话」，
点开是一张浮在工作区列表上方的面板：按最后活动时间列出最近的会话，点一行直接切过去。

## 功能

- **一行入口**：`最近会话 12`，和「设置」同一款式与高度；数字是**列表里实际列出**的条数。侧栏收成细轨道时整行隐藏，不留圆点。
- **占满侧栏**：面板宽度取自**侧栏列**（不是入口行本身，所以底部同排有别的插件时也照样占满），浮在入口上方。面板用不透明的浮起底色，不会透出后面的工作区列表。想让面板再往右多伸一点（压到对话区），把 `panelOverhang` 设成 40、80 这样的像素值即可。
- **点一行切过去，并定位到侧栏**：走官方导航（`uiWorkspace.openSession`）；随后面板收起，侧栏自动滚到该会话所在的工作区分组，必要时先展开被折叠的分组，当前会话整行高亮。不想让它自动收起就把 `closeOnPick` 设成 `false`。
- **每行带状态**：运行中（蓝色呼吸点）、等待批准 / 计划确认 / 回答（黄点）、跑完未打开（绿点）。
- **会话菜单**：悬停出现 `⋯`，打开官方会话菜单（置顶、重命名、分叉、归档、复制 Session ID），与侧栏工作区行同一套动作。
- **键盘可用**：`Esc` 收起；`↑` / `↓` / `Home` / `End` 在行间移动，回车切换。
- **不挡路**：面板不拦截背后的界面，点到面板外侧即收起；`Esc` 收起。
- **侧栏定位**：侧栏用的是宿主自己的行标记（`data-row-key`），展开分组是点宿主的工作区分组头；宿主改结构时这部分退化为「不定位」，会话照常打开。

## 子代理会话怎么处理（本插件的主要设置）

子代理会为每次委派开一个会话，官方侧栏不显示它们；最近会话如果直接平铺，
列表很快会被 `读取装配入口` 之类的子代理行占满。面板顶部「子代理」有三档：

| 档位 | 效果 |
| --- | --- |
| **折叠**（默认） | 只列主会话。主会话的排序时间取**整棵子树里最新的活动**：子代理刚跑过，主会话就浮到最上面。行上显示「N 个子代理」，左侧 `⌄` 展开可看到这些子代理会话并逐个点进去；当前正在看的会话若是子代理，其主会话行带一条左侧竖线。 |
| **隐藏** | 完全不出现子代理会话，主会话只按自己的活动时间排序。 |
| **单独** | 每个子代理会话各占一行，按它自己的活动时间排序，第二行标注「子代理」。 |

切换方式：面板里点一下即可。选择会做两件事——先存本机（`localStorage`，
离线也生效），再 `POST /api/dsh-recent-sessions/config` 写回 profile 的
`cordis.patch.yml`，所以重启后仍然有效。写回不可用时（profile 只读、宿主半没跑起来等），开关下方会显示
「未能写入配置，本机生效」，功能照常。

## 显示多少条、看多近的（「范围」）

面板顶部第二行是「范围」：**不限 / 1 天 / 7 天 / 30 天**。它只按时间窗过滤，
再按「条数上限」截断，所以列表既能控制"看多久以前的"，也能控制"最多几行"：

- 条数上限在配置里（`maxItems`，默认 12，3–50）。列表只列这么多行，入口行上的数字也就是这个数；
  标题栏在还有更多会话时显示「12 / 146 个会话」，让你知道被截掉了多少。
- 时间窗同样先存本机再写回配置，和「子代理」开关一样。
- 折叠模式下时间窗看的是**整棵子树的最新活动**：主会话自己 20 天没动、但它的子代理昨天跑过，
  那这个主会话仍算"最近"。

## 配置

在 profile 的 `cordis.patch.yml` 里找到 `id: recent-sessions` 那一行改配置：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `subagentMode` | `fold` | `fold` / `hide` / `separate`，即上面三档的默认值 |
| `maxItems` | `12` | 列表最多显示多少条（3–50） |
| `maxAgeDays` | `0` | 时间窗：`0` 不限 / `1` / `7` / `30` 天 |
| `panelOverhang` | `0` | 面板向右超出侧栏列的像素（0–320） |
| `closeOnPick` | `true` | 点一行后收起面板（`false` 则保持展开，便于连切） |
| `showWorkspace` | `true` | 每行第二行是否显示所属工作区名 |
| `defaultCollapsed` | `true` | 打开 Harness 时面板是否收起 |
| `refreshMs` | `30000` | 相对时间文案的刷新间隔（毫秒） |

面板里的开关优先于这里的默认值（本机偏好）；想回到配置默认值，清掉
`localStorage` 里的 `dsh.recent-sessions.subagent-mode.v1`（子代理）和
`dsh.recent-sessions.max-age-days.v1`（范围）即可。

## 数据来源与边界

面板不新建会话存储，直接读官方客户端快照：

- `sessions.list.byId`：标题、`updatedAt`、`running`、`blank`、`retainedBy`、`origin`、`parentId`
- `uiSession` 的会话状态：`pendingInteraction`、`completionUnread`、`running`
- `workspaces.list`：`items[].sessionIds`（反查工作区名）、`archivedSessionIds`

因此：

- **已归档会话不在列表里**，仍走官方侧栏归档流程；
- 只显示当前那个空白「新会话」，历史空白会话不占行；
- Host 半只提供配置读写两个路由，不读取、不转发会话内容。

## 安装

在 Harness 左侧的 **插件** 页面点 **添加插件**，填写下面任一个地址：

```text
github:Sunshow/dsh-recent-sessions

# 或固定版本
github:Sunshow/dsh-recent-sessions#v0.1.0
```

安装后在已安装列表里打开 `dsh-recent-sessions` 的开关。仓库里提交的就是可直接运行的插件文件，
不需要自行编译。也可以从仓库下载后填目录绝对路径（目录内包含 `package.json`）。
改动 `client.js` 后刷新一次 Harness 窗口即可生效；`index.js`（宿主半）的改动需要重启一次 Harness。

## 兼容范围

在 **macOS Desktop**（DSH 0.2.2）上验证。插件只挂两个官方扩展点：

- `sidebar.footer.action`（入口行）
- `shell.overlay`（浮层，框架级悬浮层，本身可穿透点击）

面板正文 portal 到 `document.body`（窄窗口下侧栏变抽屉时也能盖在它上面）。宿主若改掉这两个席位，
入口消失、面板不出现，但不会影响 Harness 本身。

## 许可

MIT
