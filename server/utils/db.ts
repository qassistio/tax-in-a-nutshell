// The ONE deliberate exception to this product's "nothing stored server
// side" design: a submission record, keyed by a GUID the browser is given
// once it submits, so the results page can be reloaded and still show the
// current HMRC/Companies House status without the user re-entering
// anything. It stores gateway *status metadata* only — no accounting
// figures, no company financials, nothing from the trial balance or
// accounts. Deleting the underlying database loses nothing but in-flight
// submission status.
//
// Queried through Drizzle ORM rather than hand-written SQL strings — see
// server/db/schema.ts for the table shapes. The driver is @libsql/client,
// which speaks to either a local SQLite file (`file:...`) or a remote
// Turso database (`libsql://...` + auth token) through the exact same
// client/query code — that dual-mode support is why it's used here rather
// than node:sqlite or better-sqlite3: this app is hosted on Vercel, whose
// serverless functions have no persistent filesystem, so production must
// point at a remote Turso database while local dev keeps using a plain
// file (see the dbPath/tursoDatabaseUrl/tursoAuthToken runtimeConfig
// entries in nuxt.config.ts).
//
// Schema migrations are managed by drizzle-kit (drizzle.config.ts) rather
// than the old hand-rolled idempotent ALTERs — `npm run db:generate`
// writes versioned .sql files under server/db/migrations/, and
// scripts/gen-migration-list.mjs bakes their contents into
// server/db/migrations/list.ts as plain TS constants so Nitro's bundled
// serverless output (and Vercel's deployed function bundle) can apply
// them at runtime without needing to read arbitrary files off disk.

import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { submissions, counters } from '../db/schema'
import { MIGRATIONS } from '../db/migrations/list'

const schema = { submissions, counters }
type DB = LibSQLDatabase<typeof schema>

// Cached on globalThis rather than a plain module-level variable because
// Nitro's dev server re-evaluates this module on every HMR reload —
// without the globalThis cache that would silently open a second client
// against the same file each time a server file changes while `npm run
// dev` is running. Cleared on failure so the next request can retry
// rather than being stuck with a rejected promise forever.
declare global {
  var __tinDbInit: Promise<DB> | undefined
}

// Splits a drizzle-kit-generated migration file into individual
// statements. drizzle-kit separates statements with its own
// `--> statement-breakpoint` marker comments (see server/db/migrations/
// *.sql) rather than relying on `;` alone, since a statement can
// legitimately contain semicolons inside string/blob literals — so this
// splits on that marker, not on `;`.
function splitMigrationStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean)
}

async function runMigrations(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _tin_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  for (const { name, sql } of MIGRATIONS) {
    const applied = await client.execute({ sql: 'SELECT 1 FROM _tin_migrations WHERE name = ?', args: [name] })
    if (applied.rows.length > 0) continue
    const statements = splitMigrationStatements(sql).map(s => ({ sql: s, args: [] as never[] }))
    statements.push({ sql: 'INSERT INTO _tin_migrations (name) VALUES (?)', args: [name] as never[] })
    await client.batch(statements, 'write')
  }
}

async function createDb(): Promise<DB> {
  const config = useRuntimeConfig()
  const tursoUrl = config.tursoDatabaseUrl as string | undefined
  const authToken = config.tursoAuthToken as string | undefined
  const isRemote = !!tursoUrl

  let url: string
  if (isRemote) {
    url = tursoUrl!
  } else {
    if (process.env.VERCEL) {
      throw new Error('[db] Running on Vercel without a remote database configured. Set NUXT_TURSO_DATABASE_URL and NUXT_TURSO_AUTH_TOKEN in the Vercel project settings — a local SQLite file does not persist across serverless invocations.')
    }
    const dbPath = resolve(config.dbPath as string)
    mkdirSync(dirname(dbPath), { recursive: true })
    url = `file:${dbPath}`
  }

  const client = createClient({ url, authToken: authToken || undefined })
  if (!isRemote) {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA foreign_keys = ON')
  }

  await runMigrations(client)

  return drizzle({ client, schema })
}

export function getDb(): Promise<DB> {
  if (!globalThis.__tinDbInit) {
    globalThis.__tinDbInit = createDb().catch((err) => {
      globalThis.__tinDbInit = undefined
      throw err
    })
  }
  return globalThis.__tinDbInit
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
  const db = await getDb()
  await db.insert(submissions).values({
    id: input.id,
    company_name: input.companyName,
    period_end: input.periodEnd,
    hmrc_status: 'created',
    created_at: now,
    updated_at: now
  })
}

export async function getSubmission(id: string): Promise<SubmissionRow | undefined> {
  const db = await getDb()
  const row = await db.select().from(submissions).where(eq(submissions.id, id)).get()
  return row as SubmissionRow | undefined
}

export async function updateSubmission(id: string, fields: Partial<Omit<SubmissionRow, 'id' | 'created_at'>>): Promise<void> {
  if (Object.keys(fields).length === 0) return
  const db = await getDb()
  await db.update(submissions).set({ ...fields, updated_at: new Date().toISOString() }).where(eq(submissions.id, id))
}

/** Atomically hands out the next Companies House <TransactionID> —
 *  monotonically increasing for as long as the database exists, regardless
 *  of how many browser sessions or reloads happen in between (TIS v5.3:
 *  "a different <TransactionID> should be used for each session... this
 *  reference needs to be unique and each number should also be greater
 *  than the last"). There's no concurrent-writer scenario this app needs
 *  to defend against (a single presenter, one submission in flight at a
 *  time per user), so a plain read-then-write is enough — no explicit
 *  transaction needed. */
export async function nextChTransactionId(): Promise<number> {
  const db = await getDb()
  const row = await db.select().from(counters).where(eq(counters.name, 'ch_transaction_id')).get()
  const next = (row?.value ?? 0) + 1
  if (row) {
    await db.update(counters).set({ value: next }).where(eq(counters.name, 'ch_transaction_id'))
  } else {
    await db.insert(counters).values({ name: 'ch_transaction_id', value: next })
  }
  return next
}
