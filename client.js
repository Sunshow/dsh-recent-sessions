// dsh-recent-sessions — browser half.
//
// Loaded by dsh-client-modules through the vendored lazy-CJS module table
// (window.__ModuleLoader__.load). Two registrations, one shared store:
//
//   sidebar.footer.action  the `最近会话 12` entry row, directly above Settings
//   shell.overlay          the sheet itself, floating over the workspace list
//
// Why the overlay slot instead of a document.body portal: `shell.overlay` is
// the frame-wide layer outside every column's scroll container, and it is
// click-through until an entry opts back into pointer events — exactly the
// surface a sheet anchored to the sidebar foot needs.
//
// Data comes from the official Client snapshots, never from a new store:
//   sessions.list       byId summaries: title / updatedAt / running / blank /
//                       retainedBy / origin / parentId
//   uiSession status    pendingInteraction, completionUnread, running
//   workspaces.list     items[].sessionIds (workspace name), archivedSessionIds
//
// Subagent handling is the one place with a policy, and it is a setting:
//   fold     subagent sessions fold into their main session; the main row ranks
//            by the newest activity anywhere in its subtree, and expands in place
//   hide     subagent sessions never appear
//   separate every subagent session gets its own row
//
// The mode travels: panel switch -> localStorage (works offline) -> POST to the
// Host, which persists it into the profile patch through `configEditor`.

window.__ModuleLoader__.load({
  id: 'dsh-recent-sessions',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    // The sheet must clear the sidebar's drawer layer (viewport < 768 px), which
    // is a sibling stacking context of `shell.overlay`; only a body-level portal
    // can paint above it. Absent react-dom, the sheet stays in the overlay layer.
    const createPortal = (() => {
      try {
        const reactDom = require('react-dom');
        return typeof reactDom.createPortal === 'function' ? reactDom.createPortal : null;
      } catch (error) {
        return null;
      }
    })();
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;
    // React 18 ships the store hook; the fallback keeps the panel alive on an
    // older module table instead of blanking the slot entry.
    const useSyncExternalStore = typeof React.useSyncExternalStore === 'function'
      ? React.useSyncExternalStore
      : function useStoreFallback(subscribe, getSnapshot) {
        const [value, setValue] = useState(getSnapshot);
        useEffect(() => {
          const read = () => { setValue(getSnapshot()); };
          read();
          return subscribe(read);
        }, [subscribe, getSnapshot]);
        return value;
      };

    const NS = 'recent-sessions';
    const CONFIG_URL = '/api/dsh-recent-sessions/config';
    const MODE_KEY = 'dsh.recent-sessions.subagent-mode.v1';
    const PANEL_ID = 'dsh-recent-sessions-panel';

    const MODES = ['fold', 'hide', 'separate'];
    /** Day windows the sheet offers; 0 keeps every session regardless of age. */
    const AGE_WINDOWS = [0, 1, 7, 30];
    const RANGE_KEY = 'dsh.recent-sessions.max-age-days.v1';
    const DEFAULTS = {
      subagentMode: 'fold',
      maxItems: 12,
      maxAgeDays: 0,
      panelOverhang: 0,
      closeOnPick: true,
      showWorkspace: true,
      defaultCollapsed: true,
      refreshMs: 30000,
    };

    /** Gap between the entry row's top edge and the sheet's bottom edge. */
    const ANCHOR_GAP = 6;
    /** The sheet never gets shorter than this, even in a tiny window. */
    const MIN_PANEL_HEIGHT = 150;
    /** Deepest nesting the sheet renders before children collapse into their parent. */
    const MAX_DEPTH = 3;
    /** Distance between the sheet and the sidebar column's edge, in px. */
    const COLUMN_INSET = 6;

    const EMPTY_SET = new Set();
    const EMPTY_LIST = [];

    /* ------------------------------------------------------------- dictionary */

    const DICTS = {
      zh: {
        'entry.label': '最近会话',
        'entry.open': '展开最近会话',
        'entry.close': '收起最近会话',
        'panel.label': '最近会话',
        'head.title': '最近会话',
        'head.close': '收起最近会话',
        'head.count': '{count} 个会话',
        'head.countOf': '{shown} / {count} 个会话',
        'modes.label': '子代理',
        'modes.fold': '折叠',
        'modes.hide': '隐藏',
        'modes.separate': '单独',
        'modes.fold.hint': '子代理并入主会话：主会话按子树里最新的活动排序，可展开查看',
        'modes.hide.hint': '不显示子代理会话，只列主会话自己的活动时间',
        'modes.separate.hint': '每个子代理会话各占一行，按它自己的活动排序',
        'modes.localOnly': '未能写入配置，本机生效',
        'range.label': '范围',
        'range.0': '不限',
        'range.1': '1 天',
        'range.7': '7 天',
        'range.30': '30 天',
        'range.0.hint': '不限时间，只按最后活动排序',
        'range.1.hint': '只看最近 24 小时内活动过的会话',
        'range.7.hint': '只看最近 7 天内活动过的会话',
        'range.30.hint': '只看最近 30 天内活动过的会话',
        'row.menu': '会话操作',
        'row.blank': '新会话',
        'row.untitled': '未命名会话',
        'row.subagents': '{count} 个子代理',
        'row.bubbled': '按子代理的最新活动排序',
        'row.subagent': '子代理',
        'row.expand': '展开 {name} 的子代理',
        'row.collapse': '收起 {name} 的子代理',
        'state.idle': '空闲',
        'state.running': '运行中',
        'state.done': '已完成',
        'state.approval': '等待批准',
        'state.plan-review': '等待计划确认',
        'state.question': '等待回答',
        'empty.title': '还没有最近的会话',
        'empty.hint': '打开或新建一个会话，这里就会按时间列出来',
        'empty.rangeTitle': '最近 {days} 天里没有会话',
        'empty.rangeHint': '更早的会话被「范围」挡住了',
        'empty.showAll': '改为不限',
        'time.now': '刚刚',
        'time.minutes': '{count} 分钟前',
        'time.hours': '{count} 小时前',
        'time.yesterday': '昨天',
        'time.days': '{count} 天前',
      },
      en: {
        'entry.label': 'Recent sessions',
        'entry.open': 'Show recent sessions',
        'entry.close': 'Hide recent sessions',
        'panel.label': 'Recent sessions',
        'head.title': 'Recent sessions',
        'head.close': 'Hide recent sessions',
        'head.count': '{count} sessions',
        'head.countOf': '{shown} of {count} sessions',
        'modes.label': 'Subagents',
        'modes.fold': 'Fold',
        'modes.hide': 'Hide',
        'modes.separate': 'Separate',
        'modes.fold.hint': 'Fold subagents into their main session: the main row ranks by the newest activity in its subtree and expands in place',
        'modes.hide.hint': 'Never list subagent sessions; each main session ranks by its own activity',
        'modes.separate.hint': 'Give every subagent session its own row, ranked by its own activity',
        'modes.localOnly': 'Not saved to config; applies on this device',
        'range.label': 'Range',
        'range.0': 'All',
        'range.1': '1 d',
        'range.7': '7 d',
        'range.30': '30 d',
        'range.0.hint': 'No time limit; order by last activity only',
        'range.1.hint': 'Only sessions active in the last 24 hours',
        'range.7.hint': 'Only sessions active in the last 7 days',
        'range.30.hint': 'Only sessions active in the last 30 days',
        'row.menu': 'Session actions',
        'row.blank': 'New session',
        'row.untitled': 'Untitled session',
        'row.subagents': '{count} subagents',
        'row.bubbled': 'Ranked by the newest subagent activity',
        'row.subagent': 'Subagent',
        'row.expand': 'Show the subagents of {name}',
        'row.collapse': 'Hide the subagents of {name}',
        'state.idle': 'Idle',
        'state.running': 'Running',
        'state.done': 'Finished',
        'state.approval': 'Waiting for approval',
        'state.plan-review': 'Waiting for plan review',
        'state.question': 'Waiting for an answer',
        'empty.title': 'Nothing recent yet',
        'empty.hint': 'Open or start a session and it will show up here by time',
        'empty.rangeTitle': 'No sessions in the last {days} days',
        'empty.rangeHint': 'Older sessions are outside the Range filter',
        'empty.showAll': 'Show all',
        'time.now': 'just now',
        'time.minutes': '{count} min ago',
        'time.hours': '{count} h ago',
        'time.yesterday': 'yesterday',
        'time.days': '{count} d ago',
      },
    };

    /* ------------------------------------------------------------------ store */

    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot() { return value; },
        subscribe(listener) {
          listeners.add(listener);
          return function unsubscribe() { listeners.delete(listener); };
        },
        set(next) {
          if (Object.is(next, value)) return;
          value = next;
          for (const listener of Array.from(listeners)) listener();
        },
        update(change) { this.set(change(value)); },
      };
    }

    /* ------------------------------------------------------------------ icons */

    const PATHS = {
      clock: [
        { d: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z' },
        { d: 'M8 5.2V8.4l2.2 1.4' },
      ],
      chevronDown: [{ d: 'M4 6.2 8 10.2l4-4' }],
      chevronRight: [{ d: 'M6.2 4 10.2 8l-4 4' }],
      close: [{ d: 'M4 4l8 8' }, { d: 'M12 4l-8 8' }],
      ellipsis: null,
      branch: [
        { d: 'M3.5 4.2v7.6' },
        { d: 'M3.5 7.2h3.2c1.6 0 2.4-.8 2.4-2.4V3.8' },
        { d: 'M3.5 9.6h3.4c1.7 0 2.6.9 2.6 2.6v.4' },
      ],
    };

    function icon(name, size) {
      const width = size || 16;
      if (name === 'ellipsis') {
        return h(
          'svg',
          { width, height: width, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': 'true' },
          [3, 8, 13].map(cx => h('circle', { key: cx, cx, cy: 8, r: 1.1 })),
        );
      }
      const paths = PATHS[name] || EMPTY_LIST;
      return h(
        'svg',
        {
          width,
          height: width,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        paths.map((props, index) => h('path', { key: index, ...props })),
      );
    }

    /* --------------------------------------------------------------- snapshot */

    /** Selector hook over a bare snapshot source; stable when the source is absent. */
    function makeHook(source) {
      const subscribe = source && typeof source.subscribe === 'function'
        ? function subscribeSource(listener) { return source.subscribe(listener); }
        : function subscribeNothing() { return function noop() {}; };
      const read = source && typeof source.getSnapshot === 'function'
        ? function readSource() { return source.getSnapshot(); }
        : function readNothing() { return undefined; };
      return function useSelector(selector) {
        const value = useSyncExternalStore(subscribe, read, read);
        return typeof selector === 'function' ? selector(value) : value;
      };
    }

    function identity(value) { return value; }

    /* -------------------------------------------------------------- derivation */

    /** The session the main view currently shows, from official retain counts. */
    function currentSessionId(byId) {
      for (const key of Object.keys(byId)) {
        const summary = byId[key];
        const mainView = summary && summary.retainedBy ? summary.retainedBy.mainView : 0;
        if (typeof mainView === 'number' && mainView > 0) return summary.id || key;
      }
      return undefined;
    }

    /** SessionId -> workspace title, from the workspace rows' accounted members. */
    function workspaceNames(state) {
      const names = new Map();
      const items = state && Array.isArray(state.items) ? state.items : EMPTY_LIST;
      for (const item of items) {
        if (!item) continue;
        const title = typeof item.title === 'string' && item.title !== '' ? item.title : item.path;
        const ids = Array.isArray(item.sessionIds) ? item.sessionIds : EMPTY_LIST;
        for (const id of ids) if (!names.has(id)) names.set(id, title || '');
      }
      return names;
    }

    /** The three pending kinds the shipped sidebar treats as a visible state. */
    function visiblePendingKind(kind) {
      if (kind === 'approval' || kind === 'plan-review' || kind === 'question') return kind;
      return undefined;
    }

    function relativeTime(stamp, now, t, localeId) {
      const diff = Math.max(0, now - stamp);
      const minute = 60000;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return t('time.now');
      if (diff < hour) return t('time.minutes', { count: Math.floor(diff / minute) });
      if (diff < day) return t('time.hours', { count: Math.floor(diff / hour) });
      if (diff < 2 * day) return t('time.yesterday');
      if (diff < 30 * day) return t('time.days', { count: Math.floor(diff / day) });
      try {
        return new Date(stamp).toLocaleDateString(localeId === 'zh' ? 'zh-CN' : localeId || undefined);
      } catch (error) {
        return new Date(stamp).toISOString().slice(0, 10);
      }
    }

    /**
     * Fold the official snapshots into the rows the sheet draws.
     *
     * Every session the client knows about is a candidate; archived rows and
     * non-current blank rows leave, then lineage decides what is a root. The
     * mode only changes presentation, never which session is "recent".
     *
     * @returns `{ rows, total }` — `rows` is display order, `total` counts the
     *          top-level entries the `maxItems` limit applies to.
     */
    function buildView(input) {
      const list = input.list;
      const statuses = input.statuses;
      const workspaces = input.workspaces;
      const mode = input.mode;
      const maxItems = input.maxItems;
      const showWorkspace = input.showWorkspace;
      const expanded = input.expanded || EMPTY_SET;
      const now = input.now;
      const t = input.t;
      const localeId = input.localeId;
      const countOnly = input.countOnly === true;

      const byId = list && list.byId ? list.byId : {};
      const limit = typeof maxItems === 'number' && maxItems > 0 ? maxItems : DEFAULTS.maxItems;
      const ageDays = typeof input.maxAgeDays === 'number' && input.maxAgeDays > 0 ? input.maxAgeDays : 0;
      // The window tests the bubbled activity in fold mode, so a main session
      // stays recent while any of its subagents is. Read the clock here rather
      // than from `now`, which only ticks while the sheet is open.
      const cutoff = ageDays > 0 ? Date.now() - ageDays * 86400000 : 0;
      const archived = workspaces && workspaces.archivedSessionIds
        ? new Set(workspaces.archivedSessionIds)
        : EMPTY_SET;
      const names = workspaceNames(workspaces);
      const currentId = currentSessionId(byId);

      const entries = [];
      for (const key of Object.keys(byId)) {
        const summary = byId[key];
        if (!summary) continue;
        const id = typeof summary.id === 'string' && summary.id !== '' ? summary.id : key;
        if (archived.has(id)) continue;
        if (typeof summary.updatedAt !== 'number' || !(summary.updatedAt > 0)) continue;
        if (summary.blank === true && id !== currentId) continue;
        const subagent = summary.origin === 'subagent';
        const parentId = subagent && typeof summary.parentId === 'string' && summary.parentId !== ''
          ? summary.parentId
          : undefined;
        entries.push({ id, summary, subagent, parentId, updatedAt: summary.updatedAt });
      }

      const index = new Map();
      for (const entry of entries) index.set(entry.id, entry);

      /**
       * A bad session log can present a lineage cycle (A's parent is B and B's
       * parent is A). The shipped list emits such members as roots so they are
       * never lost; do the same by dropping the parent link that closes the loop.
       */
      const cycling = new Set();
      for (const entry of entries) {
        let current = entry;
        let hops = 0;
        const seen = new Set([entry.id]);
        while (current.parentId !== undefined && hops < 32) {
          const parent = index.get(current.parentId);
          if (parent === undefined) break;
          if (seen.has(parent.id)) {
            cycling.add(entry.id);
            break;
          }
          seen.add(parent.id);
          current = parent;
          hops += 1;
        }
      }

      const children = new Map();
      const roots = [];
      for (const entry of entries) {
        const parent = entry.parentId === undefined || cycling.has(entry.id)
          ? undefined
          : index.get(entry.parentId);
        if (parent !== undefined && parent !== entry) {
          const bucket = children.get(parent.id) || [];
          bucket.push(entry);
          children.set(parent.id, bucket);
        } else {
          roots.push(entry);
        }
      }

      // Newest activity anywhere in a subtree: this is what "folding a subagent
      // into its main session as recent activity" means for the ordering.
      const activity = new Map();
      const visiting = new Set();
      function activityOf(entry) {
        const cached = activity.get(entry.id);
        if (cached !== undefined) return cached;
        if (visiting.has(entry.id)) return entry.updatedAt;
        visiting.add(entry.id);
        let value = entry.updatedAt;
        const kids = children.get(entry.id) || EMPTY_LIST;
        for (const child of kids) value = Math.max(value, activityOf(child));
        visiting.delete(entry.id);
        activity.set(entry.id, value);
        return value;
      }
      for (const entry of entries) activityOf(entry);

      function subtreeHas(entry, id) {
        return subtreeHasAt(entry, id, 0);
      }

      function subtreeHasAt(entry, id, depth) {
        if (depth > MAX_DEPTH + 4) return false;
        const kids = children.get(entry.id) || EMPTY_LIST;
        for (const child of kids) {
          if (child.id === id) return true;
          if (subtreeHasAt(child, id, depth + 1)) return true;
        }
        return false;
      }

      function descendantCount(entry) {
        return descendantCountAt(entry, 0);
      }

      function descendantCountAt(entry, depth) {
        if (depth > MAX_DEPTH + 4) return 0;
        let total = 0;
        const kids = children.get(entry.id) || EMPTY_LIST;
        for (const child of kids) total += 1 + descendantCountAt(child, depth + 1);
        return total;
      }

      function subtreeRunning(entry) {
        return subtreeRunningAt(entry, 0);
      }

      function subtreeRunningAt(entry, depth) {
        if (depth > MAX_DEPTH + 4) return false;
        const kids = children.get(entry.id) || EMPTY_LIST;
        for (const child of kids) {
          const status = statuses ? statuses.get(child.id) : undefined;
          const running = status && typeof status.running === 'boolean' ? status.running : child.summary.running === true;
          if (running || subtreeRunningAt(child, depth + 1)) return true;
        }
        return false;
      }

      function present(entry, depth, rankedAt, extra) {
        const summary = entry.summary;
        const status = statuses ? statuses.get(entry.id) : undefined;
        const pending = visiblePendingKind(
          status && status.pendingInteraction ? status.pendingInteraction.kind : undefined,
        );
        const running = status && typeof status.running === 'boolean' ? status.running : summary.running === true;

        let state = 'idle';
        let stateLabel = t('state.idle');
        if (pending !== undefined) {
          state = 'warning';
          stateLabel = t('state.' + pending);
        } else if (running) {
          state = 'ongoing';
          stateLabel = t('state.running');
        } else if (status !== undefined && status.completionUnread === true) {
          state = 'done';
          stateLabel = t('state.done');
        }

        const blank = summary.blank === true;
        const title = blank
          ? t('row.blank')
          : (typeof summary.title === 'string' && summary.title.trim() !== ''
            ? summary.title.trim()
            : (typeof summary.displayTitle === 'string' && summary.displayTitle.trim() !== ''
              ? summary.displayTitle.trim()
              : t('row.untitled')));

        const meta = [relativeTime(rankedAt, now, t, localeId)];
        const workspace = names.get(entry.id) || '';
        if (showWorkspace && workspace) meta.push(workspace);
        if (extra.count > 0) meta.push(t('row.subagents', { count: extra.count }));
        if (extra.markSubagent) meta.push(t('row.subagent'));

        return {
          key: entry.id + '@' + depth,
          id: entry.id,
          title,
          meta: meta.join(' · '),
          state,
          stateLabel,
          current: entry.id === currentId,
          ancestor: extra.ancestor,
          subagent: entry.subagent,
          depth,
          hasChildren: extra.count > 0 && depth < MAX_DEPTH,
          expanded: expanded.has(entry.id),
          childRunning: extra.count > 0 && subtreeRunning(entry),
          bubbled: rankedAt > entry.updatedAt,
          menuTitle: title,
          workspace,
        };
      }

      const rows = [];

      // Separate mode ranks and filters every session on its own timestamp.
      const all = entries.length;
      if (mode === 'separate') {
        const eligible = cutoff > 0 ? entries.filter(entry => entry.updatedAt >= cutoff) : entries;
        const ordered = eligible.slice().sort((a, b) => b.updatedAt - a.updatedAt);
        const shown = Math.min(ordered.length, limit);
        if (countOnly) return { rows: EMPTY_LIST, total: ordered.length, shown, all };
        const limited = ordered.slice(0, limit);
        for (const entry of limited) {
          rows.push(present(entry, 0, entry.updatedAt, {
            count: 0,
            ancestor: false,
            markSubagent: entry.subagent,
          }));
        }
        return { rows, total: ordered.length, shown, all };
      }

      // fold / hide: top-level rows only, subagent rows live under their parent.
      // Folding ranks by the whole subtree; hiding keeps every session on its own
      // timestamp, as the mode promises.
      const rankOf = mode === 'fold' ? activityOf : (entry => entry.updatedAt);
      const visibleRoots = roots.filter(entry => (mode === 'fold' ? true : !entry.subagent));
      const allRoots = mode === 'fold' ? roots.length : visibleRoots.length;
      const rankedRoots = cutoff > 0
        ? visibleRoots.filter(entry => rankOf(entry) >= cutoff)
        : visibleRoots;
      const ordered = rankedRoots.slice().sort((a, b) => rankOf(b) - rankOf(a));
      const shown = Math.min(ordered.length, limit);
      if (countOnly) return { rows: EMPTY_LIST, total: ordered.length, shown, all: allRoots };
      const limited = ordered.slice(0, limit);

      function pushTree(entry, depth) {
        const count = mode === 'fold' ? descendantCount(entry) : 0;
        rows.push(present(entry, depth, mode === 'fold' ? activityOf(entry) : entry.updatedAt, {
          count,
          ancestor: mode === 'fold' && currentId !== undefined && entry.id !== currentId && subtreeHas(entry, currentId),
          markSubagent: entry.subagent && depth === 0,
        }));
        if (mode !== 'fold' || count === 0 || depth >= MAX_DEPTH) return;
        if (!expanded.has(entry.id)) return;
        const kids = (children.get(entry.id) || EMPTY_LIST).slice()
          .sort((a, b) => activityOf(b) - activityOf(a));
        for (const child of kids) pushTree(child, depth + 1);
      }

      for (const root of limited) pushTree(root, 0);
      return { rows, total: ordered.length, shown, all: allRoots };
    }

    /* ----------------------------------------------------------------- styles */

    const CSS = [
      /* entry row ------------------------------------------------------- */
      '.rs-entry {',
      '  position: relative; display: flex; align-items: center; gap: var(--dsh-sidebar-label-gap, 6px);',
      '  width: 100%; height: 42px; margin: 0; padding: 0 calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));',
      '  box-sizing: border-box; border: none; border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;',
      '  border-radius: var(--dsw-radius-md, 12px); background: transparent; background-clip: padding-box;',
      '  color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 14px; line-height: 22px;',
      '  text-align: left; cursor: pointer; overflow: hidden;',
      '}',
      '@media (hover: hover) { .rs-entry:hover { background-color: var(--dsw-alias-interactive-bg-hover); } }',
      '.rs-entry:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }',
      '.rs-entry__icon { flex: none; display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); }',
      '.rs-entry__label { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
      '.rs-entry__count { flex: none; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }',
      '.rs-entry__chevron { flex: none; display: inline-flex; color: var(--dsw-alias-label-tertiary); transition: transform 150ms ease; }',
      '.rs-entry[aria-expanded="true"] .rs-entry__chevron { transform: rotate(180deg); }',

      /* sheet ----------------------------------------------------------- */
      // The sheet is portalled to document.body, so its stacking is global: above
      // the sidebar drawer (71) and the modal mask (70), below the menus (1000).
      '.rs-panel {',
      '  position: fixed; z-index: 200; display: flex; flex-direction: column; box-sizing: border-box;',
      '  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 12px);',
      /* A painted surface must not show the list behind it. layer-1/2/3 are the */
      /* opaque surfaces every shipped skin authors; the blur only rescues a skin */
      /* that makes this one translucent anyway. */
      '  background-color: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-overlay, var(--dsw-specific-sidebar-fill)));',
      '  background-image: linear-gradient(var(--dsw-alias-bg-layer-3, transparent), var(--dsw-alias-bg-layer-3, transparent));',
      '  -webkit-backdrop-filter: var(--dsw-mask-blur, blur(18px)); backdrop-filter: var(--dsw-mask-blur, blur(18px));',
      '  box-shadow: var(--dsw-elevation-prominent, 0 12px 32px rgba(0, 0, 0, 0.18));',
      '  overflow: hidden; pointer-events: auto;',
      '  animation: rs-panel-in 130ms ease-out;',
      '}',
      '@keyframes rs-panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }',
      '@media (prefers-reduced-motion: reduce) { .rs-panel { animation: none; } }',
      '.rs-head { flex: none; display: flex; align-items: center; gap: 6px; padding: 9px 6px 3px 12px; }',
      '.rs-head__title { flex: 1 1 auto; min-width: 0; font-size: 13px; line-height: 20px; font-weight: 600; color: var(--dsw-alias-label-primary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
      '.rs-head__count { flex: none; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }',
      '.rs-iconbtn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: var(--dsw-radius-xs, 4px); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
      '.rs-iconbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.rs-iconbtn:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }',

      /* mode switch ----------------------------------------------------- */
      '.rs-modes { flex: none; display: flex; align-items: center; gap: 8px; padding: 2px 12px 8px; }',
      '.rs-modes__label { flex: none; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }',
      '.rs-seg { flex: 1 1 auto; display: flex; gap: 2px; padding: 2px; border-radius: var(--dsw-radius-sm, 8px); background: var(--dsw-alias-bg-layer-2); }',
      '.rs-seg__btn { flex: 1 1 0; min-width: 0; height: 22px; padding: 0 4px; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-tertiary); font-family: inherit; font-size: 11px; line-height: 22px; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
      '.rs-seg__btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.rs-seg__btn[data-active="true"] { background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); font-weight: 500; }',
      '.rs-seg__btn:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -1px; }',
      '.rs-hint { flex: none; padding: 0 12px 6px; font-size: 11px; line-height: 16px; color: var(--dsw-alias-state-warn-primary); }',

      /* list ------------------------------------------------------------ */
      '.rs-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 6px 8px; }',
      '.rs-list::-webkit-scrollbar { width: 8px; }',
      '.rs-list::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l1); border-radius: 4px; }',
      '.rs-rowwrap { position: relative; display: flex; align-items: center; gap: 2px; padding-right: 4px; }',
      '.rs-row { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; box-sizing: border-box; padding: 5px 6px; border: none; border-radius: var(--dsw-radius-sm, 8px); background: transparent; color: var(--dsw-alias-label-primary); font-family: inherit; text-align: left; cursor: pointer; }',
      '.rs-row:hover { background: var(--dsw-alias-interactive-bg-hover); }',
      '.rs-row:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }',
      '.rs-row[data-current="true"] { background: var(--dsw-alias-interactive-bg-active); }',
      '.rs-rowwrap[data-ancestor="true"]::before { content: ""; position: absolute; left: -4px; top: 8px; bottom: 8px; width: 2px; border-radius: 1px; background: var(--dsw-alias-state-business-primary); opacity: 0.75; }',
      '.rs-row__dot { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 10px; height: 10px; }',
      '.rs-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.rs-dot[data-state="warning"] { background: var(--dsw-alias-state-warn-primary); }',
      '.rs-dot[data-state="done"] { background: var(--dsw-alias-state-success-primary); }',
      '.rs-dot[data-state="ongoing"] { background: var(--dsw-alias-state-business-primary); animation: rs-breathe 1.6s ease-in-out infinite; }',
      '@keyframes rs-breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.82); } }',
      '@media (prefers-reduced-motion: reduce) { .rs-dot[data-state="ongoing"] { animation: none; } }',
      '.rs-row__body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }',
      '.rs-row__title { font-size: 13px; line-height: 18px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
      '.rs-row__meta { display: flex; align-items: center; gap: 4px; font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
      '.rs-row__sub { display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary); }',
      '.rs-row__busy { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-state-business-primary); }',
      '.rs-twisty { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 28px; padding: 0; border: none; border-radius: var(--dsw-radius-xs, 4px); background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }',
      '.rs-twisty:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.rs-twisty:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }',
      '.rs-twisty__spacer { flex: none; width: 18px; }',
      '.rs-rowmenu { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: var(--dsw-radius-xs, 4px); background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; opacity: 0; transition: opacity 120ms ease; }',
      '.rs-rowwrap:hover .rs-rowmenu, .rs-rowwrap:focus-within .rs-rowmenu, .rs-rowmenu:focus-visible { opacity: 1; }',
      '.rs-rowmenu:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.rs-rowmenu:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }',
      '@media (hover: none) { .rs-rowmenu { opacity: 1; } }',
      '.rs-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }',

      /* empty state ----------------------------------------------------- */
      '.rs-empty { display: flex; flex-direction: column; gap: 4px; padding: 26px 16px 30px; text-align: center; }',
      '.rs-empty__title { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }',
      '.rs-empty__hint { font-size: 11px; line-height: 17px; color: var(--dsw-alias-label-tertiary); }',
      '.rs-empty__action { align-self: center; margin-top: 6px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm, 8px); background: transparent; color: var(--dsw-alias-label-secondary); font-family: inherit; font-size: 11px; line-height: 16px; cursor: pointer; }',
      '@media (hover: hover) { .rs-empty__action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); } }',
    ].join('\n');

    /* ---------------------------------------------------------------- geometry */

    /** Host-published top inset (title strip, traffic lights) the sheet must not cover. */
    function frameOverlayTop() {
      try {
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top');
        const value = Number.parseFloat(raw);
        return Number.isFinite(value) && value > 0 ? value : 12;
      } catch (error) {
        return 12;
      }
    }

    /** Whether a value is a DOM node; the guards below must hold outside a real DOM too. */
    function isNode(value) {
      return typeof Node !== 'undefined' && value instanceof Node;
    }

    /** Whether a value is a DOM element. */
    function isElement(value) {
      return typeof Element !== 'undefined' && value instanceof Element;
    }


    /**
     * The sidebar column the entry row lives in.
     *
     * Anchoring the sheet to the entry's own box is wrong as soon as another
     * plugin shares the footer row: the entry shrinks and the sheet comes out
     * narrower than the column. Walk up while the ancestor is still clearly a
     * column (far narrower than the window) and take that box, minus the
     * column's own inline padding, so the sheet spans the sidebar's content
     * width in any column size, zoom or window size.
     *
     * @param anchor - the entry row element.
     * @param anchorRect - its measured box.
     * @returns viewport box the sheet should cover.
     */
    function columnFrame(anchor, anchorRect, overhang) {
      const rootElement = document.documentElement;
      const viewportWidth = window.innerWidth || (rootElement ? rootElement.clientWidth : 0) || 0;
      let columnRect = null;
      let node = anchor.parentElement;
      for (let hops = 0; node !== null && hops < 8; hops += 1, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        // Slot outlets wrap occupants in `display: contents` boxes, which have
        // no box at all: skip them instead of stopping the walk there.
        if (rect.width <= 0 || rect.height <= 0) continue;
        // The app frame is the window; a column never is.
        if (viewportWidth > 0 && rect.width > viewportWidth * 0.6) break;
        columnRect = rect;
      }
      if (columnRect === null) {
        return { left: Math.round(anchorRect.left), width: Math.round(anchorRect.width) };
      }
      // A small inset keeps the sheet off the column edge without depending on
      // the column's own padding (which differs between hosts and skins).
      const extra = typeof overhang === 'number' && overhang > 0 ? Math.min(overhang, 320) : 0;
      const left = Math.round(columnRect.left + COLUMN_INSET);
      const span = Math.max(anchorRect.width, columnRect.width - COLUMN_INSET * 2) + extra;
      const viewportMax = viewportWidth > 0 ? viewportWidth - left - COLUMN_INSET : span;
      return { left, width: Math.round(Math.max(160, Math.min(span, viewportMax))) };
    }

    /* ---------------------------------------------------------------- reveal */

    /** Escape a session id for an attribute selector. */
    function attributeValue(value) {
      const css = window.CSS;
      if (css && typeof css.escape === 'function') return css.escape(value);
      return String(value).replace(/["\\]/g, '\\$&');
    }

    /**
     * The sidebar row for `id`, expanding its workspace group when the group is
     * collapsed and the row therefore not rendered.
     * @param title - workspace title, used to find the owning group header.
     * @returns the row element, or null when this session has no sidebar row.
     */
    function sidebarRowFor(id, title) {
      const selector = '[data-row-key="session:' + attributeValue(id) + '"]';
      const row = document.querySelector(selector);
      if (row !== null) return row;
      if (typeof title !== 'string' || title === '') return null;
      for (const header of document.querySelectorAll('[data-row-key^="workspace:"]')) {
        const text = (header.textContent || '').trim();
        if (!text.startsWith(title)) continue;
        // Clicking a group header only toggles its expansion; it selects nothing.
        if (header.getAttribute('aria-expanded') === 'false') header.click();
        return null;
      }
      return null;
    }

    /**
     * Bring the sidebar row of a just-opened session into view.
     *
     * The shipped browser keeps its own reveal to Session-search picks, so a
     * surface outside it has no service to ask; this walks the documented row
     * keys instead, expands the owning group once when the row is collapsed
     * away, and scrolls only when the row is actually outside the viewport.
     * Best effort: no row, no change.
     */
    function revealInSidebar(id, title) {
      let attempt = 0;
      const tick = () => {
        attempt += 1;
        const row = sidebarRowFor(id, attempt === 1 ? title : undefined);
        if (row === null) {
          if (attempt < 10) window.setTimeout(tick, 60);
          return;
        }
        const port = row.closest('[data-sidebar-scrollport]');
        if (port !== null) {
          const rowRect = row.getBoundingClientRect();
          const portRect = port.getBoundingClientRect();
          if (rowRect.top >= portRect.top && rowRect.bottom <= portRect.bottom) return;
        }
        try {
          row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        } catch (error) {
          row.scrollIntoView();
        }
      };
      window.requestAnimationFrame(tick);
    }

    /* ------------------------------------------------------------------ apply */

    function apply(ctx) {
      const locale = ctx.get('locale', false);

      // Translate through the Client locale service when available; the built-in
      // dictionary keeps the panel working in profiles that drop that service.
      // Registered inside an effect: the service rejects a duplicate namespace
      // and hands back the disposer that removing it needs.
      ctx.effect(function registerDictionaries() {
        if (locale === undefined || typeof locale.register !== 'function') return function noDictionaries() {};
        const disposers = [];
        for (const id of Object.keys(DICTS)) {
          try {
            const dispose = locale.register(NS, id, DICTS[id]);
            if (typeof dispose === 'function') disposers.push(dispose);
          } catch (error) {
            /* a locale the host does not know still falls back below */
          }
        }
        return function removeDictionaries() {
          for (const dispose of disposers) dispose();
        };
      }, 'recent-sessions: dictionaries');

      let translate;
      try {
        translate = locale && typeof locale.bind === 'function' ? locale.bind(NS) : undefined;
      } catch (error) {
        translate = undefined;
      }

      /** The active locale id from a LocaleSnapshot, when it carries one. */
      function localeIdOf(snapshot) {
        const id = snapshot && (snapshot.active || snapshot.locale || snapshot.id);
        return typeof id === 'string' && id !== '' ? id : undefined;
      }

      function activeLocaleId() {
        try {
          const snapshot = locale && typeof locale.getSnapshot === 'function'
            ? locale.getSnapshot()
            : (locale && typeof locale.getLocale === 'function' ? locale.getLocale() : undefined);
          return localeIdOf(snapshot) || 'zh';
        } catch (error) {
          return 'zh';
        }
      }

      /**
       * Translate a key: the Client locale service first (so a userland
       * dictionary can override), the built-in dictionaries as the floor.
       * @param key - dictionary key.
       * @param values - `{token}` replacements.
       */
      function t(key, values) {
        let text = '';
        if (translate) {
          try {
            text = translate(key);
          } catch (error) {
            text = '';
          }
        }
        if (typeof text !== 'string' || text === '' || text === key) {
          const id = activeLocaleId();
          const dict = DICTS[id] || DICTS.zh;
          text = dict[key] || DICTS.zh[key] || key;
        }
        if (values) {
          for (const token of Object.keys(values)) {
            text = text.split('{' + token + '}').join(String(values[token]));
          }
        }
        return text;
      }

      const panel = createStore({
        open: false,
        hydrated: false,
        mode: DEFAULTS.subagentMode,
        maxAgeDays: DEFAULTS.maxAgeDays,
        config: DEFAULTS,
        canPersist: false,
        saving: false,
        persistError: '',
        expanded: new Set(),
        anchor: null,
        now: Date.now(),
      });

      /** Fallback hooks for hosts that do not hand the standard props to a slot. */
      const fallbacks = {
        sessions: makeHook(ctx.get('sessions', false) && ctx.get('sessions', false).list),
        status: makeHook(ctx.get('uiSession', false) && ctx.get('uiSession', false).sessionStatus),
        workspaces: makeHook(ctx.get('workspaces', false) && ctx.get('workspaces', false).list),
        locale: makeHook(locale),
      };

      /* ---- panel state ------------------------------------------------- */

      function openPanel() {
        panel.update(state => (state.open ? state : { ...state, open: true, now: Date.now() }));
      }

      function closePanel() {
        panel.update(state => (state.open ? { ...state, open: false } : state));
      }

      function togglePanel() {
        if (panel.getSnapshot().open) closePanel();
        else openPanel();
      }

      function toggleExpand(id) {
        panel.update((state) => {
          const next = new Set(state.expanded);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { ...state, expanded: next };
        });
      }

      function setAnchor(element) {
        panel.update((state) => {
          if (state.anchor === element) return state;
          // The entry unmounts when the sidebar collapses to its rail: the sheet
          // has lost its anchor, so drop it instead of re-opening on return.
          if (element === null) return { ...state, anchor: null, open: false };
          return { ...state, anchor: element };
        });
      }

      function readStoredMode() {
        try {
          const stored = window.localStorage.getItem(MODE_KEY);
          return MODES.includes(stored) ? stored : undefined;
        } catch (error) {
          return undefined;
        }
      }

      function writeStoredMode(mode) {
        try {
          window.localStorage.setItem(MODE_KEY, mode);
        } catch (error) {
          /* private mode: the switch still applies for this page */
        }
      }

      function readStoredRange() {
        try {
          const raw = window.localStorage.getItem(RANGE_KEY);
          // An absent key is not the same as "unlimited": only an explicit
          // stored value may override the configured default.
          if (raw === null) return undefined;
          const stored = Number(raw);
          return AGE_WINDOWS.includes(stored) ? stored : undefined;
        } catch (error) {
          return undefined;
        }
      }

      function writeStoredRange(days) {
        try {
          window.localStorage.setItem(RANGE_KEY, String(days));
        } catch (error) {
          /* private mode: the switch still applies for this page */
        }
      }

      /** Send one preference to the Host, which persists it into the profile patch. */
      function persist(patch) {
        panel.update(current => ({ ...current, saving: true, persistError: '' }));
        fetch(CONFIG_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(patch),
        }).then(async (response) => {
          let payload = null;
          try {
            payload = await response.json();
          } catch (error) {
            payload = null;
          }
          if (!response.ok || (payload && payload.ok === false)) {
            throw new Error((payload && payload.error) || ('HTTP ' + response.status));
          }
          panel.update(current => ({ ...current, saving: false, persistError: '' }));
        }).catch((error) => {
          panel.update(current => ({
            ...current,
            saving: false,
            persistError: error && error.message ? error.message : String(error),
          }));
        });
      }

      function setMode(mode) {
        if (!MODES.includes(mode)) return;
        if (panel.getSnapshot().mode === mode) return;
        writeStoredMode(mode);
        panel.update(current => ({ ...current, mode }));
        persist({ subagentMode: mode });
      }

      function setRange(days) {
        if (!AGE_WINDOWS.includes(days)) return;
        if (panel.getSnapshot().maxAgeDays === days) return;
        writeStoredRange(days);
        panel.update(current => ({ ...current, maxAgeDays: days }));
        persist({ maxAgeDays: days });
      }

      /* ---- shared actions ---------------------------------------------- */

      function openSession(id) {
        const uiWorkspace = ctx.get('uiWorkspace', false);
        if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
          try {
            uiWorkspace.openSession(id);
            return true;
          } catch (error) {
            /* fall through to the row-click fallback */
          }
        }
        const row = document.querySelector('[data-row-key="session:' + attributeValue(id) + '"]');
        if (row !== null && typeof row.dispatchEvent === 'function') {
          row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return true;
        }
        ctx.logger?.warn?.(`[dsh-recent-sessions] could not open session ${id}`);
        return false;
      }

      function openRowMenu(id, title, element) {
        const menus = ctx.get('contextMenus', false);
        if (menus === undefined || typeof menus.open !== 'function') return;
        const rect = element.getBoundingClientRect();
        menus.open(
          { kind: 'session', value: { sessionId: id, displayTitle: title } },
          { x: Math.round(rect.left), y: Math.round(rect.bottom + 4) },
        );
      }

      /* ---- data -------------------------------------------------------- */

      /**
       * Subscribe the component to the official snapshots and derive the rows.
       * Every hook is called on every render, so the hook order never depends on
       * which props the host supplied.
       * @param props - slot props carrying the standard selector hooks.
       * @param state - panel store snapshot.
       * @param options - `countOnly` skips row building for the entry badge.
       */
      function useView(props, state, options) {
        const useSessions = typeof props.useSessions === 'function' ? props.useSessions : fallbacks.sessions;
        const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : fallbacks.workspaces;
        const useSessionStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : fallbacks.status;
        const list = useSessions(identity);
        const workspaceState = useWorkspaces(identity);
        const statuses = useSessionStatus(identity);
        const localeSnapshot = fallbacks.locale(identity);
        const localeId = localeIdOf(localeSnapshot) || activeLocaleId();
        const countOnly = options !== undefined && options.countOnly === true;
        return useMemo(() => buildView({
          list,
          statuses,
          workspaces: workspaceState,
          mode: state.mode,
          maxItems: state.config.maxItems,
          maxAgeDays: state.maxAgeDays,
          showWorkspace: state.config.showWorkspace,
          expanded: countOnly ? EMPTY_SET : state.expanded,
          now: state.now,
          t,
          localeId,
          countOnly,
        }), [
          list, workspaceState, statuses, state.mode, state.expanded, state.now,
          state.config.maxItems, state.maxAgeDays, state.config.showWorkspace, localeId, countOnly,
        ]);
      }

      /* ---- entry row --------------------------------------------------- */

      function EntryRow(props) {
        const state = useSyncExternalStore(panel.subscribe, panel.getSnapshot, panel.getSnapshot);
        const view = useView(props, state, { countOnly: true });
        const wide = props.wide !== false;
        const setRef = useCallback((element) => { setAnchor(element); }, []);
        if (!wide) return null;
        return h(
          'button',
          {
            type: 'button',
            ref: setRef,
            className: 'rs-entry',
            'aria-expanded': state.open ? 'true' : 'false',
            'aria-controls': PANEL_ID,
            'aria-haspopup': 'dialog',
            title: state.open ? t('entry.close') : t('entry.open'),
            onClick: togglePanel,
          },
          h('span', { className: 'rs-entry__icon', 'aria-hidden': 'true' }, icon('clock', 16)),
          h('span', { className: 'rs-entry__label' }, t('entry.label')),
          view.shown > 0 ? h('span', { className: 'rs-entry__count' }, String(view.shown)) : null,
          h('span', { className: 'rs-entry__chevron', 'aria-hidden': 'true' }, icon('chevronDown', 14)),
        );
      }

      /* ---- sheet ------------------------------------------------------- */

      function Panel(props) {
        const state = useSyncExternalStore(panel.subscribe, panel.getSnapshot, panel.getSnapshot);
        if (!state.open || state.anchor === null) return null;
        return h(PanelBody, { ...props, panelState: state });
      }

      function PanelBody(props) {
        const state = props.panelState;
        const view = useView(props, state);
        const panelRef = useRef(null);
        const listRef = useRef(null);
        const [geo, setGeo] = useState(null);

        // Measure the anchor (the entry row) instead of guessing the sidebar's
        // geometry: the sheet then lines up with whatever column width, window
        // size or zoom the user runs.
        useLayoutEffect(() => {
          const anchor = state.anchor;
          if (!anchor) return undefined;
          let frame = 0;
          const measure = () => {
            const rect = anchor.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
              setGeo(null);
              return;
            }
            const column = columnFrame(anchor, rect, state.config.panelOverhang);
            const room = Math.max(MIN_PANEL_HEIGHT, Math.min(rect.top - frameOverlayTop() - 6, window.innerHeight * 0.62));
            setGeo({
              left: column.left,
              width: column.width,
              bottom: Math.round(window.innerHeight - rect.top + ANCHOR_GAP),
              maxHeight: Math.round(room),
            });
          };
          const schedule = () => {
            if (frame !== 0) return;
            frame = window.requestAnimationFrame(() => {
              frame = 0;
              measure();
            });
          };
          measure();
          window.addEventListener('resize', schedule);
          window.addEventListener('scroll', schedule, true);
          let observer;
          if (typeof window.ResizeObserver === 'function') {
            observer = new window.ResizeObserver(schedule);
            observer.observe(anchor);
          }
          return () => {
            if (frame !== 0) window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule, true);
            if (observer) observer.disconnect();
          };
        }, [state.anchor, state.config.panelOverhang]);

        // Relative time ages while the sheet stays open.
        useEffect(() => {
          const interval = window.setInterval(() => {
            panel.update(current => (current.open ? { ...current, now: Date.now() } : current));
          }, state.config.refreshMs);
          return () => { window.clearInterval(interval); };
        }, [state.config.refreshMs]);

        // Outside click closes (a row click stays inside), Escape closes from
        // anywhere — the sheet is never a modal, nothing behind it is blocked.
        useEffect(() => {
          const onPointerDown = (event) => {
            const panelElement = panelRef.current;
            const anchorElement = state.anchor;
            if (!panelElement) return;
            const target = event.target;
            if (isNode(target) && panelElement.contains(target)) return;
            if (anchorElement && isNode(target) && anchorElement.contains(target)) return;
            // Menus and toasts are portalled outside the sheet; a click there is
            // a click on one of our own actions, not a click away.
            if (isElement(target) && target.closest('[role="menu"], [data-context-menu], [data-context-menu-trigger]') !== null) return;
            closePanel();
          };
          const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closePanel();
            const anchorElement = state.anchor;
            if (anchorElement && typeof anchorElement.focus === 'function') anchorElement.focus();
          };
          document.addEventListener('pointerdown', onPointerDown, true);
          document.addEventListener('keydown', onKeyDown, true);
          return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
          };
        }, [state.anchor]);

        // Hand focus to the sheet so the arrow keys and Escape work at once.
        // `geo` is null on the first commit, so focus waits for the measured
        // render and then never steals focus again.
        const focused = useRef(false);
        useLayoutEffect(() => {
          if (geo === null || focused.current) return;
          focused.current = true;
          const element = panelRef.current;
          if (element && typeof element.focus === 'function') element.focus({ preventScroll: true });
        }, [geo]);

        const onPanelKeyDown = (event) => {
          const key = event.key;
          if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;
          const listElement = listRef.current;
          if (!listElement) return;
          const items = Array.from(listElement.querySelectorAll('button[data-row-id]'));
          if (items.length === 0) return;
          event.preventDefault();
          const index = items.indexOf(document.activeElement);
          let next;
          if (key === 'Home') next = 0;
          else if (key === 'End') next = items.length - 1;
          else if (index < 0) next = key === 'ArrowDown' ? 0 : items.length - 1;
          else next = Math.min(items.length - 1, Math.max(0, index + (key === 'ArrowDown' ? 1 : -1)));
          items[next].focus();
        };

        if (geo === null) return null;

        const rows = view.rows;
        const sheetElement = h(
          'div',
          {
            id: PANEL_ID,
            ref: panelRef,
            className: 'rs-panel',
            role: 'dialog',
            'aria-label': t('panel.label'),
            'aria-modal': 'false',
            tabIndex: -1,
            style: {
              left: geo.left + 'px',
              width: geo.width + 'px',
              bottom: geo.bottom + 'px',
              maxHeight: geo.maxHeight + 'px',
            },
            onKeyDown: onPanelKeyDown,
          },
          h(
            'div',
            { className: 'rs-head' },
            h('span', { className: 'rs-head__title' }, t('head.title')),
            h('span', { className: 'rs-head__count' }, view.shown < view.total
              ? t('head.countOf', { shown: view.shown, count: view.total })
              : t('head.count', { count: view.total })),
            h(
              'button',
              {
                type: 'button',
                className: 'rs-iconbtn',
                'aria-label': t('head.close'),
                title: t('head.close'),
                onClick: () => {
                  closePanel();
                  const anchorElement = state.anchor;
                  if (anchorElement && typeof anchorElement.focus === 'function') anchorElement.focus();
                },
              },
              icon('close', 14),
            ),
          ),
          renderModes(state),
          renderRange(state),
          state.persistError || (state.hydrated && !state.canPersist)
            ? h(
              'div',
              { className: 'rs-hint', role: 'status', title: state.persistError || undefined },
              t('modes.localOnly'),
            )
            : null,
          rows.length === 0
            ? h(
              'div',
              { className: 'rs-empty' },
              h('div', { className: 'rs-empty__title' }, view.total === 0 && view.all > 0 && state.maxAgeDays > 0
                ? t('empty.rangeTitle', { days: state.maxAgeDays })
                : t('empty.title')),
              h('div', { className: 'rs-empty__hint' }, view.total === 0 && view.all > 0 && state.maxAgeDays > 0
                ? t('empty.rangeHint')
                : t('empty.hint')),
              view.total === 0 && view.all > 0 && state.maxAgeDays > 0
                ? h('button', { type: 'button', className: 'rs-empty__action', onClick: () => setRange(0) }, t('empty.showAll'))
                : null,
            )
            : h(
              'div',
              { className: 'rs-list', ref: listRef, role: 'list' },
              rows.map(renderRow),
            ),
        );
        if (createPortal === null) return sheetElement;
        return createPortal(sheetElement, document.body);
      }

      function renderModes(state) {
        return h(
          'div',
          { className: 'rs-modes' },
          h('span', { className: 'rs-modes__label' }, t('modes.label')),
          h(
            'div',
            { className: 'rs-seg', role: 'group', 'aria-label': t('modes.label') },
            MODES.map(mode => h(
              'button',
              {
                key: mode,
                type: 'button',
                className: 'rs-seg__btn',
                'data-active': state.mode === mode ? 'true' : 'false',
                'aria-pressed': state.mode === mode ? 'true' : 'false',
                title: t('modes.' + mode + '.hint'),
                onClick: () => setMode(mode),
              },
              t('modes.' + mode),
            )),
          ),
        );
      }

      /** The `范围` switch: one segment per accepted day window. */
      function renderRange(state) {
        return h(
          'div',
          { className: 'rs-modes' },
          h('span', { className: 'rs-modes__label' }, t('range.label')),
          h(
            'div',
            { className: 'rs-seg', role: 'group', 'aria-label': t('range.label') },
            AGE_WINDOWS.map(days => h(
              'button',
              {
                key: String(days),
                type: 'button',
                className: 'rs-seg__btn',
                'data-active': state.maxAgeDays === days ? 'true' : 'false',
                'aria-pressed': state.maxAgeDays === days ? 'true' : 'false',
                title: t('range.' + days + '.hint'),
                onClick: () => setRange(days),
              },
              t('range.' + days),
            )),
          ),
        );
      }

      /** One row: twisty (parents only) + the row button + the actions menu. */
      function renderRow(row) {
        const menus = ctx.get('contextMenus', false);
        const menuAvailable = menus !== undefined && typeof menus.open === 'function';
        return h(
          'div',
          {
            key: row.key,
            className: 'rs-rowwrap',
            role: 'listitem',
            'data-ancestor': row.ancestor ? 'true' : 'false',
            style: row.depth > 0 ? { paddingLeft: Math.min(row.depth, MAX_DEPTH) * 12 + 'px' } : undefined,
          },
          row.hasChildren
            ? h(
              'button',
              {
                type: 'button',
                className: 'rs-twisty',
                'aria-expanded': row.expanded ? 'true' : 'false',
                'aria-label': t(row.expanded ? 'row.collapse' : 'row.expand', { name: row.title }),
                title: t(row.expanded ? 'row.collapse' : 'row.expand', { name: row.title }),
                onClick: (event) => {
                  event.stopPropagation();
                  toggleExpand(row.id);
                },
              },
              icon(row.expanded ? 'chevronDown' : 'chevronRight', 14),
            )
            : h('span', { className: 'rs-twisty__spacer', 'aria-hidden': 'true' }),
          h(
            'button',
            {
              type: 'button',
              className: 'rs-row',
              'data-row-id': row.id,
              'data-current': row.current ? 'true' : 'false',
              'data-subagent': row.subagent ? 'true' : 'false',
              'aria-current': row.current ? 'true' : undefined,
              title: row.title,
              onClick: () => {
                if (!openSession(row.id)) return;
                if (panel.getSnapshot().config.closeOnPick !== false) closePanel();
                revealInSidebar(row.id, row.workspace);
              },
            },
            h(
              'span',
              { className: 'rs-row__dot' },
              row.state === 'idle' ? null : h('span', { className: 'rs-dot', 'data-state': row.state, 'aria-hidden': 'true' }),
              h('span', { className: 'rs-sr' }, row.stateLabel),
            ),
            h(
              'span',
              { className: 'rs-row__body' },
              h('span', { className: 'rs-row__title' }, row.title),
              h(
                'span',
                { className: 'rs-row__meta' },
                row.bubbled
                  ? h('span', { className: 'rs-row__sub', title: t('row.bubbled'), 'aria-hidden': 'true' }, icon('branch', 11))
                  : null,
                row.childRunning ? h('span', { className: 'rs-row__busy', 'aria-hidden': 'true' }) : null,
                h('span', null, row.meta),
              ),
            ),
          ),
          menuAvailable
            ? h(
              'button',
              {
                type: 'button',
                className: 'rs-rowmenu',
                'aria-label': t('row.menu'),
                title: t('row.menu'),
                onClick: (event) => {
                  event.stopPropagation();
                  openRowMenu(row.id, row.menuTitle, event.currentTarget);
                },
              },
              icon('ellipsis', 14),
            )
            : null,
        );
      }

      /* ---- registration ------------------------------------------------ */

      ctx.effect(function insertStyles() {
        const existing = document.getElementById('dsh-recent-sessions-styles');
        const style = existing || document.createElement('style');
        style.id = 'dsh-recent-sessions-styles';
        style.setAttribute('data-plugin', 'dsh-recent-sessions');
        style.textContent = CSS;
        if (!existing) document.head.appendChild(style);
        return function removeStyles() {
          style.remove();
        };
      }, 'recent-sessions: styles');

      ctx.effect(function loadConfig() {
        let cancelled = false;
        const stored = readStoredMode();
        const storedRange = readStoredRange();
        fetch(CONFIG_URL, { headers: { accept: 'application/json' }, cache: 'no-store' })
          .then(response => (response.ok ? response.json() : null))
          .then((payload) => {
            if (cancelled || !payload || typeof payload !== 'object') return;
            const config = {
              subagentMode: MODES.includes(payload.subagentMode) ? payload.subagentMode : DEFAULTS.subagentMode,
              maxItems: typeof payload.maxItems === 'number' ? payload.maxItems : DEFAULTS.maxItems,
              maxAgeDays: AGE_WINDOWS.includes(payload.maxAgeDays) ? payload.maxAgeDays : DEFAULTS.maxAgeDays,
              panelOverhang: typeof payload.panelOverhang === 'number' ? payload.panelOverhang : DEFAULTS.panelOverhang,
              closeOnPick: typeof payload.closeOnPick === 'boolean' ? payload.closeOnPick : DEFAULTS.closeOnPick,
              showWorkspace: typeof payload.showWorkspace === 'boolean' ? payload.showWorkspace : DEFAULTS.showWorkspace,
              defaultCollapsed: typeof payload.defaultCollapsed === 'boolean' ? payload.defaultCollapsed : DEFAULTS.defaultCollapsed,
              refreshMs: typeof payload.refreshMs === 'number' ? payload.refreshMs : DEFAULTS.refreshMs,
            };
            const mode = stored !== undefined ? stored : config.subagentMode;
            const maxAgeDays = storedRange !== undefined ? storedRange : config.maxAgeDays;
            panel.update((state) => {
              if (state.hydrated) return state;
              return {
                ...state,
                hydrated: true,
                config,
                mode,
                maxAgeDays,
                canPersist: payload.canPersist === true,
                open: config.defaultCollapsed === false ? true : state.open,
              };
            });
          })
          .catch(() => {
            if (cancelled) return;
            const mode = stored !== undefined ? stored : DEFAULTS.subagentMode;
            const maxAgeDays = storedRange !== undefined ? storedRange : DEFAULTS.maxAgeDays;
            panel.update(state => (state.hydrated ? state : { ...state, hydrated: true, mode, maxAgeDays }));
          });
        return function disposeConfig() { cancelled = true; };
      }, 'recent-sessions: config');

      ctx.slots.inject('sidebar.footer.action', function () {
        return ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'recent-sessions.entry',
          order: 5,
        }, EntryRow);
      });

      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: 'recent-sessions.panel',
          order: 55,
        }, Panel);
      });
    }

    return {
      inject: ['slots'],
      apply,
    };
  },
});
