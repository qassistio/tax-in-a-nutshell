// The ONE deliberate exception to this product's "nothing stored server
// side" design: a submission record, keyed by a GUID the browser is given
// once it submits, so the results page can be reloaded and still show the
// current HMRC/Companies House status without the user re-entering
// anything. It stores gateway *status metadata* only — no accounting
// figures, no company financials, nothing from the trial balance or
// accounts. Deleting .data/submissions.sqlite loses nothing but in-flight
// submission status.
//
// Queried through Drizzle ORM rather than hand-written SQL strings — see
// schema.ts for the table shapes. The actual SQLite engine underneath is
// still Node's built-in node:sqlite (stable-enough experimental API on
// Node 22+), not better-sqlite3: this project deliberately avoids native
// dependencies (better-sqlite3 needs a working node-gyp/MSBuild toolchain
// to install, which isn't guaranteed on every dev machine — it failed
// outright when actually tried here). Drizzle has no built-in node:sqlite
// driver, so this wires node:sqlite up through Drizzle's `sqlite-proxy`
// driver instead — a thin callback adapter Drizzle ships for exactly this
// "bring your own SQLite engine" situation. This is why every exported
// function below is async even though node:sqlite itself is synchronous:
// sqlite-proxy's dialect is async-only.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq } from 'drizzle-orm'
import { submissions, counters } from './schema'

const DB_PATH = join(process.cwd(), '.data', 'submissions.sqlite')

let raw: DatabaseSync | null = null
let db: ReturnType<typeof drizzle<{ submissions: typeof submissions; counters: typeof counters }>> | null = null

function getRaw(): DatabaseSync {
  if (raw) return raw
  mkdirSync(dirname(DB_PATH), { recursive: true })
  raw = new DatabaseSync(DB_PATH)
  raw.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      company_name TEXT,
      period_end TEXT,
      hmrc_message_class TEXT,
      hmrc_status TEXT NOT NULL DEFAULT 'created',
      hmrc_correlation_id TEXT,
      hmrc_poll_endpoint TEXT,
      hmrc_poll_interval_seconds INTEGER,
      hmrc_submission_id TEXT,
      hmrc_irmark TEXT,
      hmrc_payload_hash TEXT,
      hmrc_raw_response TEXT,
      hmrc_message TEXT,
      ch_status TEXT,
      ch_message TEXT,
      ch_transaction_id TEXT,
      ch_submission_number TEXT,
      ch_raw_response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  // No migration system exists here (see the module comment) — this
  // store only ever holds disposable status metadata, so evolving the
  // schema in place with idempotent ALTERs is simpler than a real
  // migration runner (e.g. drizzle-kit) would be worth for it. Existing
  // .data/submissions.sqlite files created before a column existed just
  // get it added; SQLite has no ADD COLUMN IF NOT EXISTS, so a failed
  // ALTER (column already there) is simply caught and ignored.
  for (const column of ['ch_transaction_id', 'ch_submission_number', 'ch_raw_response']) {
    try {
      raw.exec(`ALTER TABLE submissions ADD COLUMN ${column} TEXT`)
    } catch {
      // already exists
    }
  }
  raw.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )
  `)
  return raw
}

function getDb() {
  if (db) return db
  const database = getRaw()
  // The callback Drizzle's sqlite-proxy driver calls for every query it
  // builds — translates node:sqlite's synchronous prepare/run/get/all
  // into the { rows } shape sqlite-proxy expects. node:sqlite's .get()
  // returns a plain object (or undefined); .all() returns an array of
  // those; sqlite-proxy wants arrays of column values instead (it maps
  // them back onto field names itself via the schema), hence the
  // Object.values() below.
  db = drizzle(async (sql, params, method) => {
    const stmt = database.prepare(sql)
    if (method === 'run') {
      stmt.run(...params)
      return { rows: [] }
    }
    if (method === 'get') {
      // Drizzle's sqlite-proxy expects `rows` to BE the flat array of
      // column values for 'get' (it takes `result.rows` as the row
      // itself), unlike 'all' where `rows` is an array of such arrays —
      // wrapping it in an extra array here breaks getSubmission() at
      // runtime (silently returns an object keyed "id" holding the whole
      // values array instead of the real row). And on a miss it must be
      // undefined rather than [] — sqlite-proxy's own "no row" check is
      // `!row`, which an empty array fails (arrays are always truthy),
      // so getSubmission() would otherwise resolve to an object of
      // all-undefined fields instead of undefined.
      const row = stmt.get(...params) as Record<string, unknown> | undefined
      return { rows: row ? Object.values(row) : undefined as unknown as unknown[] }
    }
    const rows = stmt.all(...params) as Record<string, unknown>[]
    return { rows: rows.map(row => Object.values(row)) }
  }, { schema: { submissions, counters } })
  return db
}

export interface SubmissionRow {
  id: string
  company_name: string | null
  period_end: string | null
  hmrc_message_class: string | null
  hmrc_status: string
  hmrc_correlation_id: string | null
  hmrc_poll_endpoint: string | null
  hmrc_poll_interval_seconds: number | null
  hmrc_submission_id: string | null
  hmrc_irmark: string | null
  hmrc_payload_hash: string | null
  hmrc_raw_response: string | null
  hmrc_message: string | null
  ch_status: string | null
  ch_message: string | null
  ch_transaction_id: string | null
  ch_submission_number: string | null
  ch_raw_response: string | null
  created_at: string
  updated_at: string
}

export async function createSubmission(input: { id: string; companyName: string; periodEnd: string }): Promise<void> {
  const now = new Date().toISOString()
  await getDb().insert(submissions).values({
    id: input.id,
    company_name: input.companyName,
    period_end: input.periodEnd,
    hmrc_status: 'created',
    created_at: now,
    updated_at: now
  })
}

export async function getSubmission(id: string): Promise<SubmissionRow | undefined> {
  const row = await getDb().select().from(submissions).where(eq(submissions.id, id)).get()
  return row as SubmissionRow | undefined
}

export async function updateSubmission(id: string, fields: Partial<Omit<SubmissionRow, 'id' | 'created_at'>>): Promise<void> {
  if (Object.keys(fields).length === 0) return
  await getDb().update(submissions).set({ ...fields, updated_at: new Date().toISOString() }).where(eq(submissions.id, id))
}

/** Atomically hands out the next Companies House <TransactionID> —
 *  monotonically increasing for as long as .data/submissions.sqlite
 *  exists, regardless of how many browser sessions or reloads happen in
 *  between (TIS v5.3: "a different <TransactionID> should be used for
 *  each session... this reference needs to be unique and each number
 *  should also be greater than the last"). There's no concurrent-writer
 *  scenario this app needs to defend against (single local SQLite file,
 *  one Nitro process), so a plain read-then-write is enough — no
 *  explicit transaction needed. */
export async function nextChTransactionId(): Promise<number> {
  const database = getDb()
  const row = await database.select().from(counters).where(eq(counters.name, 'ch_transaction_id')).get()
  const next = (row?.value ?? 0) + 1
  if (row) {
    await database.update(counters).set({ value: next }).where(eq(counters.name, 'ch_transaction_id'))
  } else {
    await database.insert(counters).values({ name: 'ch_transaction_id', value: next })
  }
  return next
}
