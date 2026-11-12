/**
 * Host half of the `dsh-recent-sessions` bundle.
 *
 * The panel itself needs no Host data: the browser half reads the official
 * client snapshots (`sessions.list`, `uiSession.sessionStatus`,
 * `workspaces.list`), which are the same facts the shipped sidebar renders
 * from. The Host half owns exactly two things:
 *
 *   1. `GET /api/dsh-recent-sessions/config` — the resolved plugin config, so a
 *      `cordis.patch.yml` default reaches the panel;
 *   2. `POST /api/dsh-recent-sessions/config` — persist `subagentMode` through
 *      the profile's `configEditor`, so the switch inside the panel is a real
 *      setting instead of page-local state.
 *
 * `subagentMode` is declared volatile, so flipping it updates the live config
 * in place instead of reloading the plugin; the browser half still keeps a
 * local copy because the panel must work even when no editor is available.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const API_BASE = '/api/dsh-recent-sessions'
const CONFIG_PATH = `${API_BASE}/config`

/** Accepted `subagentMode` values, in UI order. */
const SUBAGENT_MODES = ['fold', 'hide', 'separate']

/** Fallbacks for every field, applied when the schema is unavailable. */
const DEFAULTS = {
  subagentMode: 'fold',
  maxItems: 12,
  maxAgeDays: 0,
  panelOverhang: 0,
  closeOnPick: true,
  showWorkspace: true,
  defaultCollapsed: true,
  refreshMs: 30000,
}

/** Accepted `maxAgeDays` values: unlimited plus the day windows the panel offers. */
const AGE_WINDOWS = [0, 1, 7, 30]

/** Upper bound for the one POST body this plugin reads. */
const MAX_BODY_BYTES = 8 * 1024

/**
 * schemastery is optional on purpose: a bundle installed from a linked local
 * directory resolves its imports from the checkout, where DSH's own packages
 * are absent. The profile's hoisted copy is then the same module the rest of
 * the app runs, so ask for it explicitly before giving up. Without a schema the
 * plugin still validates and defaults its config by hand; only the settings
 * form in Plugin Manager goes missing.
 */
async function loadSchemastery() {
  try {
    const imported = await import('@deepseek-ai/schemastery')
    const candidate = imported.default ?? imported
    if (typeof candidate?.object === 'function') return candidate
  } catch {
    /* not resolvable from a linked checkout */
  }
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir !== 'string' || profileDir === '') return undefined
  const packageDir = join(profileDir, 'node_modules', '@deepseek-ai', 'schemastery')
  try {
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
    const entry = manifest?.exports?.['.']?.import ?? manifest?.module ?? manifest?.main
    if (typeof entry !== 'string') return undefined
    const imported = await import(pathToFileURL(join(packageDir, entry)).href)
    const candidate = imported.default ?? imported
    return typeof candidate?.object === 'function' ? candidate : undefined
  } catch {
    return undefined
  }
}

/** Build the row schema once, or leave the config unvalidated-but-defaulted. */
function buildSchema(z) {
  if (z === undefined) return undefined
  return z.object({
    subagentMode: z.union([z.const('fold'), z.const('hide'), z.const('separate')]).default('fold').volatile(),
    maxItems: z.natural().min(3).max(50).default(DEFAULTS.maxItems),
    maxAgeDays: z.union([z.const(0), z.const(1), z.const(7), z.const(30)]).default(DEFAULTS.maxAgeDays).volatile(),
    panelOverhang: z.natural().min(0).max(320).default(DEFAULTS.panelOverhang),
    closeOnPick: z.boolean().default(DEFAULTS.closeOnPick),
    showWorkspace: z.boolean().default(DEFAULTS.showWorkspace),
    defaultCollapsed: z.boolean().default(DEFAULTS.defaultCollapsed),
    refreshMs: z.natural().min(5000).max(600000).default(DEFAULTS.refreshMs),
  })
}

const schema = buildSchema(await loadSchemastery())

export const Config = schema

export const name = 'dsh-recent-sessions'

/** Only the HTTP server is required; every other read is optional. */
export const inject = ['webServer']

/* ------------------------------------------------------------------ config */

/** Read a value that may be a volatile config reference. */
function plain(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function'
    ? value.get()
    : value
}

/** Clamp one integer field into its accepted range. */
function clampInteger(value, fallback, min, max) {
  const number = typeof value === 'number' ? Math.round(value) : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Resolve the effective config from raw row values plus defaults. */
function resolveConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const mode = plain(source.subagentMode)
  return {
    subagentMode: SUBAGENT_MODES.includes(mode) ? mode : DEFAULTS.subagentMode,
    maxItems: clampInteger(plain(source.maxItems), DEFAULTS.maxItems, 3, 50),
    maxAgeDays: AGE_WINDOWS.includes(plain(source.maxAgeDays)) ? plain(source.maxAgeDays) : DEFAULTS.maxAgeDays,
    panelOverhang: clampInteger(plain(source.panelOverhang), DEFAULTS.panelOverhang, 0, 320),
    closeOnPick: typeof plain(source.closeOnPick) === 'boolean' ? plain(source.closeOnPick) : DEFAULTS.closeOnPick,
    showWorkspace: typeof plain(source.showWorkspace) === 'boolean' ? plain(source.showWorkspace) : DEFAULTS.showWorkspace,
    defaultCollapsed: typeof plain(source.defaultCollapsed) === 'boolean' ? plain(source.defaultCollapsed) : DEFAULTS.defaultCollapsed,
    refreshMs: clampInteger(plain(source.refreshMs), DEFAULTS.refreshMs, 5000, 600000),
  }
}

/* ------------------------------------------------------------------- async */

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

/** Hostnames a local browser page may legitimately use for the same server. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function originHost(origin) {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/** Accept the server's own origin, plus the loopback spellings of it. */
function sameOrigin(origin, expected) {
  if (expected === null) return true
  if (origin === expected) return true
  const requested = originHost(origin)
  const own = originHost(expected)
  if (requested === undefined || own === undefined) return false
  // `localhost` and `127.0.0.1` are the same server; a user typing either one
  // must be able to change a setting, so match the way the shipped Host does.
  return LOOPBACK_HOSTS.has(requested) && LOOPBACK_HOSTS.has(own)
}

/** Reject cross-origin writes, mirroring the shipped Host plugins. */
function admitted(ctx, req, res, method) {
  if (req.method !== method) {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return false
  }
  if (method !== 'POST') return true
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  if (!sameOrigin(origin, readWebOrigin(ctx))) {
    sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
    return false
  }
  return true
}
function readWebOrigin(ctx) {
  const webServer = ctx.get('webServer', false)
  if (webServer === undefined || typeof webServer.getOrigin !== 'function') return null
  try {
    return webServer.getOrigin()
  } catch {
    return null
  }
}

/** The profile row this plugin was loaded from, when the profile is addressable. */
function ownEntry(ctx) {
  const fiber = ctx.fiber
  const entry = fiber === undefined ? undefined : fiber.entry
  return entry === undefined ? undefined : entry
}

function configEditor(ctx) {
  const editor = ctx.get('configEditor', false)
  return editor !== undefined && typeof editor.edit === 'function' ? editor : undefined
}

/* ------------------------------------------------------------------ plugin */

/**
 * Serve the panel config and persist its one user-facing switch.
 * @param ctx - plugin context.
 * @param config - validated row config (fields may be volatile references).
 */
export function apply(ctx, config) {
  const webServer = ctx.get('webServer', false)
  if (webServer === undefined || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('[dsh-recent-sessions] no web server in this profile; the panel keeps its defaults')
    return
  }

  // One route, two methods: the web server rejects duplicate (kind, path)
  // pairs, so GET and POST share a single registration.
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: CONFIG_PATH,
    handler: (req, res) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (!admitted(ctx, req, res, 'GET')) return
        sendJson(res, 200, {
          ok: true,
          ...resolveConfig(config),
          canPersist: ownEntry(ctx) !== undefined && configEditor(ctx) !== undefined,
        })
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, HEAD, POST', 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
        return
      }
      if (!admitted(ctx, req, res, 'POST')) return
      void (async () => {
        try {
          const body = await readJsonBody(req)
          const patch = {}
          if (body.subagentMode !== undefined) {
            if (!SUBAGENT_MODES.includes(body.subagentMode)) throw new Error('invalid subagentMode')
            patch.subagentMode = body.subagentMode
          }
          if (body.maxAgeDays !== undefined) {
            if (!AGE_WINDOWS.includes(body.maxAgeDays)) throw new Error('invalid maxAgeDays')
            patch.maxAgeDays = body.maxAgeDays
          }
          if (Object.keys(patch).length === 0) throw new Error('nothing to change')
          const editor = configEditor(ctx)
          const entry = ownEntry(ctx)
          if (editor === undefined || entry === undefined) {
            throw new Error('this profile cannot persist plugin configuration')
          }
          await editor.edit(entry, current => ({ ...current, ...patch }))
          sendJson(res, 200, { ok: true, ...patch })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: describe(error) })
        }
      })()
    },
  }), 'recent-sessions: config route')

  ctx.logger?.info?.(
    `[dsh-recent-sessions] config ready at ${CONFIG_PATH} (schema ${schema === undefined ? 'unavailable' : 'active'})`,
  )
}
