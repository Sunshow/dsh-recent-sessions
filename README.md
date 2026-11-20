<div align="center">

# dsh-recent-sessions

**最近会话 · A Recent sessions sheet for the DeepSeek Harness sidebar.**

[![License: MIT](https://img.shields.io/badge/license-MIT-2f7dd1.svg)](LICENSE)
![Platform: DSH Web / Desktop](https://img.shields.io/badge/DSH-web%20%7C%20desktop-1f2937.svg)

</div>

> **English** — A sidebar plugin for DeepSeek Harness. One extra row above Settings opens a sheet over the workspace list: the latest sessions by last activity, click a row to switch, collapse the sheet and scroll the sidebar to that session's workspace. A search field at the top filters by session title, workspace name or path, session ID and state; opening the sheet focuses it, and Escape clears it. **Subagent sessions are the point**: fold them into their main session (the main row ranks by the newest activity anywhere in its subtree and expands in place), hide them, or list them on their own row — chosen with a switch in the sheet that saves back to the profile. A second switch limits the list to the last 1 / 7 / 30 days. A third switch puts a **live bar** at the bottom of the window: the sessions that are in progress — running, or waiting on you — always on screen, never covering the columns, and clickable. The entry row also carries the list's status dots — yellow for a session waiting on you, green for a finished session not opened yet — and shows both at once, without counts. The sheet spans the sidebar column and paints an opaque surface.

## English quick start

Install from the Harness **Plugins** page → **Add plugin**:

```text
github:Sunshow/dsh-recent-sessions

# or pin a version
github:Sunshow/dsh-recent-sessions#v0.5.0
```

Then open the switch for `dsh-recent-sessions` in the installed list. The repository ships the plugin files as-is; nothing needs building.

Find the entry row above **Settings** in the sidebar: `最近会话 · Recent sessions  <count>`. Click it, pick a session; the sheet closes and the sidebar scrolls to that session's workspace row (expanding the group first when it is collapsed).

Opening the sheet puts the cursor in its search field, so you can start typing right away. Type to filter, `↑` / `↓` to highlight results (the caret stays in the field), `Enter` to open the highlighted row (or the top match once a query is typed), `Esc` to clear a query and drop focus, then `Esc` again to close the sheet. A printable key pressed anywhere in the sheet also returns focus to the field (Space still activates a focused row or switch).

| Setting | Default | Meaning |
| --- | --- | --- |
| `subagentMode` | `fold` | `fold` / `hide` / `separate` — see below |
| `maxItems` | `12` | rows in the list (3–50) |
| `maxAgeDays` | `0` | time window: `0` unlimited, `1`, `7`, `30` |
| `panelOverhang` | `0` | extra px the sheet reaches past the sidebar (0–320) |
| `closeOnPick` | `true` | collapse the sheet after a row opens a session |
| `showWorkspace` | `true` | show the workspace name on each row |
| `defaultCollapsed` | `true` | start with the sheet closed |
| `activityBar` | `false` | keep the bottom live bar of sessions in progress |
| `refreshMs` | `30000` | relative-time refresh interval |

## Entry status dots

The entry row summarizes the top-level rows the sheet lists when it opens, so the sidebar tells you that something needs a look without opening the sheet:

| Dot | Meaning | Cleared when |
| --- | --- | --- |
| yellow | a listed session is waiting for approval, a plan review or an answer | you act on that session |
| green | a listed session finished and has not been opened yet | you open that session |

Both dots appear side by side when both states exist, and no counts are shown. Hovering the row explains the dots in the active language; screen readers hear the same text as part of the row label. The signals follow the sheet's default list — the current subagent mode, Range window and the `maxItems` cap; search and expansion do not change them — so an indicator always has a matching top-level row when the sheet opens. Folded subagent sessions do not add an indicator of their own (a finished subagent stays unread until it is opened, which would keep the green dot lit); `separate` mode gives subagents their own rows so their states do show, and `hide` mode leaves them out entirely.

## Search

The field under the title is focused the moment you open the sheet, and a printable key pressed anywhere in the sheet brings focus back to it — after arrow-key navigation or after clicking one of the switches you can simply keep typing.

- Matches session titles (including the raw and display titles), workspace names and paths, session IDs, and non-idle state labels in the active language (e.g. `运行中` / `Running`). Several space-separated terms must all match.
- Search is flat and newest-first. It ignores the fold tree — a matching subagent appears with its subagent tag — and ignores the Range window, so an old or nested session is still found; a note under the switches says so while matching rows are shown. The `hide` subagent mode still leaves subagent sessions out, and the empty state says so when that is the cause.
- `↑` / `↓` move a highlight through the results while the caret stays in the field; `Enter` opens the highlighted row (or the top match once a query is typed); `Esc` with a query clears it and drops focus (`Esc` with no query closes the sheet); and the `✕` button only clears.
- Matches are highlighted in the title and meta line. A match on text the row does not normally show (workspace path, raw/display title or session ID) is named as an extra meta segment — a session-ID match shows `Session ID` — so every result explains itself. Search also shows the workspace name even when `showWorkspace` is off, for the same reason.
- The result list is still capped by `maxItems`; the header then reads `N matches · showing M`. Only sessions the client has loaded are searched; archived sessions stay in the sidebar's archive.

## Live bar

The third switch in the sheet (`进行中栏` / **Live bar**) keeps a strip at the bottom of the window listing the sessions that need your eyes: **running**, **waiting** on you, and **finished but not opened yet**. The strip fills the frame's `shell.bottom` seat — a slot the harness reserves below all three columns and sizes from its content — so the bar reduces the columns' height instead of covering them: the workspace list, the conversation and the sidebar all stay usable and visible.

- **What shows up**: a session whose turn is running; one waiting for approval, a plan review or an answer; and one that finished with no one having opened it yet — opening it clears the chip. **The dot carries the state and the chip carries only the title** (blue running, yellow waiting, green finished-unread); hovering a chip, or a screen reader, spells out the state, the subagent marker and the workspace, and the strip stays 28 px tall. In `fold` mode a main session whose subagent is working is listed too — blue for that work, or yellow when the subagent is the one waiting — and ranked by the newest activity in its subtree; `hide` keeps the subagent row out but still reports its work and its pending question on the main row; `separate` gives every subagent its own chip, unread ones included. A folded subagent's unread flag deliberately does not bubble into its main row: opening the main session does not clear it, so it would glow forever — the same call the sidebar's status dots make.
- **Needs you first**: waiting sessions come first, then finished-unread ones, then merely running ones; within each group the order is newest activity. The lead is a bare count badge, so the strip spends no width on words: its tooltip and status text give the breakdown (`1 个待确认 · 2 个未读 · 3 个进行中`). The chips scroll horizontally when they overflow.
- **Too many to fit**: the collapsed strip lines the chips up in one row and scrolls sideways. As soon as two or more sessions are in flight it also offers `展开` at the right end, which pulls the strip up into a vertically scrolling list (capped at 40% of the window height) where every row adds its workspace (and its subagent marker) under the title; picking a row opens it and folds the list back, and `收起` closes it without choosing. Nothing is ever dropped from either view.
- **Independent of the sheet's filters**: the bar ignores the Range window (a three-day run is still running), `maxItems` and search, so nothing can silently hide a session you should see. Archived and blank sessions stay out, exactly as in the sheet.
- **Stable height**: once enabled, the strip keeps its height even with nothing to show and says `暂无进行中或未读的会话`. A bar that appeared and disappeared would resize every column mid-task. While the preference is off, the seat is not claimed at all — it renders nothing and reserves no space.
- **One click to switch**: a chip opens that session and scrolls the sidebar to its workspace, same as a sheet row (the sheet follows `closeOnPick`); hover shows title, state and workspace for the full label.
- **Right-click for actions**: right-clicking a chip — or a row in the pull-up list — opens the same Session menu as the sheet's `⋯`: pin, rename, fork, archive, copy Session ID. The menu lands at the pointer (a keyboard context-menu key uses the chip's own box), so a running session can be pinned without leaving the strip. Hovering a chip says so in its tooltip.
- **Turning it on and off**: the sheet switch (`关闭` / `常驻`) is the saved preference — it writes `localStorage` (`dsh.recent-sessions.activity-bar.v1`) and the profile's config through `POST /api/dsh-recent-sessions/config`, so `activityBar: true` makes the bar the default on every window. The `✕` at the right end of the bar only dismisses it on this device: one click cannot outrank a configured default forever.

`shell.bottom` is a `single` seat, claimed only while the bar is on: two plugins asking for it cannot both be shown, and a host without that seat simply hides the bar while the entry row and the sheet keep working.

Subagent handling (the switch at the top of the sheet, saved through `POST /api/dsh-recent-sessions/config` into the profile's `cordis.patch.yml`):

| Mode | What the list shows | Ranking |
| --- | --- | --- |
| **fold** (default) | main sessions only, each with an `N 个子代理` count and a `⌄` to expand | newest activity in the whole subtree |
| **hide** | no subagent rows at all | each main session's own activity |
| **separate** | one row per subagent session, marked `子代理` | each row's own activity |

Limitations: archived sessions are not listed (they stay in the sidebar's archive); search filters the same loaded snapshot in the browser and never reads session content; locating the sidebar row relies on the host's `data-row-key` markers, so it degrades to "opens the session only" if the host changes them; the live bar needs the host's `shell.bottom` seat and disappears if another plugin claims it; verified on macOS Desktop with DSH 0.2.2.

---

## 中文说明

**侧栏多一行「最近会话」，随时回到刚才的会话；打开就能搜，子代理会话按你的偏好折叠、隐藏或单独列出；需要盯着跑的时候，底部还有一条常驻的「进行中」栏。**

DeepSeek Harness（DSH）侧栏插件。工作区列表下方、设置上方多一行「最近会话」，
点开是一张浮在工作区列表上方的面板：按最后活动时间列出最近的会话，点一行直接切过去。
面板顶部的搜索框按会话标题、工作区名称 / 路径、Session ID 和状态过滤；点开浮层时它自动取得焦点，`Esc` 清空并脱离焦点。
入口行还会带上状态点：有待确认的会话亮黄点、已完成未打开的会话亮绿点，两种可以同时出现。
再打开「进行中栏」，窗口底部会多一条常驻的会话栏，只列正在跑和等你确认的会话，点一下切过去。

## 功能

- **一行入口**：`最近会话 12`，和「设置」同一款式与高度；数字是**列表里实际列出**的条数。侧栏收成细轨道时整行隐藏，不留圆点。
- **入口带状态点**：面板打开时列出的顶层行中，只要有一个在等待确认（批准 / 计划确认 / 回答），入口行就亮黄点；只要有一个跑完还没打开，就亮绿点。两种同时存在时并排显示，不显示数量；悬停整行会看到当前语言下的说明，读屏也会把它算进入口行的名称。统计范围就是面板的默认列表——受「子代理」「范围」和「条数上限」影响，搜索和展开不改变它，所以亮起的点一定能对应到一个顶层行；折叠在子代理行里的会话不单独亮（子代理跑完通常要打开它才会消掉绿点，并进父行会让入口一直亮着），选择「单独」时它们各自成行、状态照常显示，选择「隐藏」则不列子代理。
- **直接搜**：浮层打开时搜索框自动取得焦点，打字即过滤；可以搜会话标题、工作区名称 / 路径、Session ID 和状态。焦点不在搜索框时按任意字符也会回到搜索框继续输入（空格仍用于激活当前聚焦的行或开关）。
- **进行中栏**：面板里的第三个开关。打开后窗口底部常驻一条会话栏，只列**正在跑**和**等你确认**的会话；它占的是宿主的 `shell.bottom` 席位，靠自身高度把三栏挤矮，所以不遮住任何内容。不受「范围」「条数上限」和搜索影响，跑了几天的会话也不会被藏起来；点一下就切过去并定位侧栏；没有进行中的会话时保留一条「暂无进行中的会话」，不会忽隐忽现地挤动布局。
- **占满侧栏**：面板宽度取自**侧栏列**（不是入口行本身，所以底部同排有别的插件时也照样占满），浮在入口上方。面板用不透明的浮起底色，不会透出后面的工作区列表。想让面板再往右多伸一点（压到对话区），把 `panelOverhang` 设成 40、80 这样的像素值即可。
- **点一行切过去，并定位到侧栏**：走官方导航（`uiWorkspace.openSession`）；随后面板收起，侧栏自动滚到该会话所在的工作区分组，必要时先展开被折叠的分组，当前会话整行高亮。不想让它自动收起就把 `closeOnPick` 设成 `false`。
- **每行带状态**：运行中（蓝色呼吸点）、等待批准 / 计划确认 / 回答（黄点）、跑完未打开（绿点）。
- **会话菜单**：悬停出现 `⋯`，打开官方会话菜单（置顶、重命名、分叉、归档、复制 Session ID），与侧栏工作区行同一套动作。
- **键盘可用**：打字即搜索；`↑` / `↓` 在结果间移动高亮（光标留在搜索框），回车打开高亮项（有搜索词时可直接打开第一条）；`Tab` 可把焦点移到开关或结果行，在结果行上 `Home` / `End` 到头尾；有搜索时 `Esc` 先清空并脱离焦点，再按一次才收起面板，没有搜索时按 `Esc` 直接收起。
- **不挡路**：面板不拦截背后的界面，点到面板外侧即收起。
- **侧栏定位**：侧栏用的是宿主自己的行标记（`data-row-key`），展开分组是点宿主的工作区分组头；宿主改结构时这部分退化为「不定位」，会话照常打开。

## 搜索

搜索框在面板标题下方，点开浮层就取得焦点，直接打字即可；焦点不在搜索框时（比如刚用方向键选过行、点过开关），按任意可打印字符也会回到搜索框继续输入。

- 匹配范围：会话标题（含原始标题与 displayTitle）、工作区名称与路径、Session ID、以及当前语言下非空闲的状态文案（运行中 / Running 等）。空格分隔多个词时，必须全部命中。
- 搜索是平铺的、按会话自己的最后活动倒序：不沿子代理折叠树，也不受「范围」限制——有结果时开关下方会提示这一点，很旧或折叠在里面的会话照样能搜到；「隐藏」档仍然不列子代理，若因此没有结果，空状态里会说明。
- `↑` / `↓` 在结果间移动高亮，光标一直留在搜索框；回车打开高亮项（没有高亮且有搜索词时打开第一条）；有搜索时 `Esc` 清空并脱离焦点（再按一次收起面板），没有搜索时直接收起；右侧 `✕` 只清空。
- 标题和副标题里的命中会高亮。若命中的是行上原本不显示的内容（工作区路径、原始 / displayTitle、Session ID），会在副标题末尾补一段原因——Session ID 命中显示「会话 ID」——让每条结果都说得清为什么被搜到。搜索时即使 `showWorkspace` 关掉也会显示工作区名，原因同上。
- 结果仍受「条数上限」截断，标题栏会显示「找到 N 个 · 显示 M」；只搜客户端已经加载的会话，已归档会话不在其中。

## 进行中栏（一直盯着跑着的会话）

面板里的第三个开关是「进行中栏」。打开后，窗口底部出现一条常驻的会话栏，列**需要你留意的会话**：在跑的、等你的，以及**跑完还没打开的**。

- **哪些会进来**：正在跑 turn 的；等你批准 / 确认计划 / 回答的；以及已完成但还没打开的（打开那个会话，它就从栏上消失）。**状态只用圆点表示，格子上只写标题**（蓝=在跑、黄=等你、绿=跑完未读）；悬停或读屏才会补出状态、子代理标记和工作区，整条栏高 28px，不拿宽度去写状态词。折叠档里，主会话的子代理在跑也算（蓝点），子代理在等你确认时同样会浮上来（黄点）；这两类都按整棵子树的最新活动排序。隐藏档不列子代理行，但主会话仍会替它显示在跑或在等。单独档让子代理各占一格，已完成未读的也列。折叠进主会话的子代理即使已完成未读也**不会**冒上来——打开主会话并不会消掉它的未读标记，会一直亮着；侧栏的状态点也是这个口径。
- **等你的排前面**：等确认的排最前，其次是已完成未读的，最后是还在跑的；同组内按最新活动排序，放不下时横向滚动。开头只有一个数字（就是条数），不写状态词；三类各多少放在它的悬停提示和读屏文本里（「1 个待确认 · 2 个未读 · 3 个进行中」）。
- **太多怎么办**：收起状态是一行，放不下就横向滚动。只要有两个以上进行中的会话，右端就会出现「展开」——把这条栏向上拉成竖排列表（最高 40% 窗口高度、内部纵向滚动），每行在标题下面补出工作区（子代理再加一个标记）；点一行切过去，列表自动收起；点「收起」只收列表不选。两种形态都不会丢掉任何会话。
- **不受面板筛选影响**：不看「范围」（跑了一周的会话照样在），不受「条数上限」，也不参与搜索，任何设置都不会悄悄藏掉一个你该看到的会话。已归档和空白会话照旧不出现。
- **高度稳定**：开关打开后，没有可列的会话也会保留一条「暂无进行中或未读的会话」，不会因为会话开始 / 结束让三栏高度忽大忽小；开关关掉时这个席位根本不注册，不渲染、不占高度。
- **点一下就切**：每一格的开头是状态点（运行中蓝点呼吸、等你确认黄点），点整格切到该会话，并把侧栏滚到它所在的工作区（面板照 `closeOnPick` 收起）；悬停能看到标题、状态和工作区的完整说明。
- **右键更多**：右键格子（或上拉列表里的行）会打开和面板 `⋯` 同一个会话菜单——置顶、重命名、分叉、归档、复制 Session ID——菜单落在鼠标位置（键盘的菜单键则贴着格子），所以想置顶一个正在跑的会话不用离开这条栏。悬停提示里也写了这一点。
- **怎么开关**：面板里的开关（`关闭` / `常驻`）是**会保存的偏好**——先存本机（`localStorage` 的 `dsh.recent-sessions.activity-bar.v1`），再写回 profile 配置，所以 `activityBar: true` 会让新窗口默认打开它。栏右侧的 `✕` 只是在本机收起，不会把配置里的默认值改掉，点错了还能从面板开关回来。

它占的是宿主的 `shell.bottom` 席位（`single`），而且只在打开时占：两个插件不能同时显示，宿主没有这个席位时这条栏不出现，入口行和面板照常工作。

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
| `activityBar` | `false` | 是否常驻底部「进行中」栏 |
| `refreshMs` | `30000` | 相对时间文案的刷新间隔（毫秒） |

面板里的开关优先于这里的默认值（本机偏好）；想回到配置默认值，清掉
`localStorage` 里的 `dsh.recent-sessions.subagent-mode.v1`（子代理）、
`dsh.recent-sessions.max-age-days.v1`（范围）和
`dsh.recent-sessions.activity-bar.v1`（进行中栏）即可。

## 数据来源与边界

面板不新建会话存储，直接读官方客户端快照：

- `sessions.list.byId`：标题、`updatedAt`、`running`、`blank`、`retainedBy`、`origin`、`parentId`
- `uiSession` 的会话状态：`pendingInteraction`、`completionUnread`、`running`
- `workspaces.list`：`items[].sessionIds`（反查工作区名）、`archivedSessionIds`

因此：

- **已归档会话不在列表里**，仍走官方侧栏归档流程；
- **搜索只做本地过滤**：匹配标题、工作区、Session ID 和状态，不读取会话正文；
- 只显示当前那个空白「新会话」，历史空白会话不占行；
- 底部「进行中」栏和面板用同一份快照，只是换了筛选口径：状态取自 `uiSession`，不读会话正文；
- Host 半只提供配置读写两个路由，不读取、不转发会话内容。

## 安装

在 Harness 左侧的 **插件** 页面点 **添加插件**，填写下面任一个地址：

```text
github:Sunshow/dsh-recent-sessions

# 或固定版本
github:Sunshow/dsh-recent-sessions#v0.5.0
```

安装后在已安装列表里打开 `dsh-recent-sessions` 的开关。仓库里提交的就是可直接运行的插件文件，
不需要自行编译。也可以从仓库下载后填目录绝对路径（目录内包含 `package.json`）。
改动 `client.js` 后刷新一次 Harness 窗口即可生效；`index.js`（宿主半）的改动需要重启一次 Harness。

## 兼容范围

在 **macOS Desktop**（DSH 0.2.2）上验证。插件只挂三个官方扩展点：

- `sidebar.footer.action`（入口行）
- `shell.overlay`（浮层，框架级悬浮层，本身可穿透点击）
- `shell.bottom`（底部进行中栏，宿主预留的常驻席位，内容高度决定三栏剩余高度）

面板正文 portal 到 `document.body`（窄窗口下侧栏变抽屉时也能盖在它上面）。宿主若改掉这些席位，
对应的入口或栏不出现（面板不受影响），但不会影响 Harness 本身。

## 许可

MIT
