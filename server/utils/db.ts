// The ONE deliberate exception to "nothing stored server-side": a
// submission record keyed by a GUID, letting the results page reload and
// still show gateway status without the user re-entering anything. Stores
// status metadata only — no accounting figures or company financials.
//
// Queried via Drizzle ORM (see server/db/schema.ts for table shapes).
// Driver is @libsql/client, which speaks to either a local SQLite file or
// a remote Turso database through the same client/query code — needed
// because Vercel's serverless functions have no persistent filesystem, so
// production points at Turso while dev uses a plain file (see
// dbPath/tursoDatabaseUrl/tursoAuthToken in nuxt.config.ts).
//
// Migrations are managed by drizzle-kit: `npm run db:generate` writes
// versioned .sql files under server/db/migrations/, and
// scripts/gen-migration-list.mjs bakes them into server/db/migrations/
// list.ts as plain TS constants so Nitro's bundled output can apply them
// without reading arbitrary files off disk.

import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { submissions, counters } from '../db/schema'
import { MIGRATIONS } from '../db/migrations/list'

const schema = { submissions, counters }
type DB = LibSQLDatabase<typeof schema>

// Cached on globalThis, not a module-level variable, because Nitro's dev
// server re-evaluates this module on every HMR reload (which would
// otherwise open a second client each time). Cleared on failure so the
// next request can retry.
declare global {
  var __tinDbInit: Promise<DB> | undefined
}

// drizzle-kit separates statements with `--> statement-breakpoint` marker
// comments rather than `;` alone, since `;` can legitimately appear inside
// a string/blob literal.
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

/** Hands out the next Companies House <TransactionID>, monotonically
 *  increasing across sessions (TIS v5.3 requires strictly-increasing,
 *  unique values). No concurrent-writer scenario to defend against here,
 *  so a plain read-then-write is enough. */
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
