// The ONE deliberate exception to this product's "nothing stored server
// side" design: a submission record, keyed by a GUID the browser is given
// once it submits, so the results page can be reloaded and still show the
// current HMRC/Companies House status without the user re-entering
// anything. It stores gateway *status metadata* only — no accounting
// figures, no company financials, nothing from the trial balance or
// accounts. Deleting .data/submissions.sqlite loses nothing but in-flight
// submission status.
//
// Uses Node's built-in node:sqlite (stable-enough experimental API on
// Node 22+) rather than adding a native dependency like better-sqlite3.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DB_PATH = join(process.cwd(), '.data', 'submissions.sqlite')

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec(`
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
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
  created_at: string
  updated_at: string
}

export function createSubmission(input: { id: string; companyName: string; periodEnd: string }): void {
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO submissions (id, company_name, period_end, hmrc_status, created_at, updated_at)
    VALUES (?, ?, ?, 'created', ?, ?)
  `).run(input.id, input.companyName, input.periodEnd, now, now)
}

export function getSubmission(id: string): SubmissionRow | undefined {
  return getDb().prepare('SELECT * FROM submissions WHERE id = ?').get(id) as SubmissionRow | undefined
}

export function updateSubmission(id: string, fields: Partial<Omit<SubmissionRow, 'id' | 'created_at'>>): void {
  const keys = Object.keys(fields)
  if (keys.length === 0) return
  const set = keys.map(k => `${k} = ?`).join(', ')
  const values = keys.map(k => (fields as Record<string, unknown>)[k]) as (string | number | null)[]
  getDb().prepare(`UPDATE submissions SET ${set}, updated_at = ? WHERE id = ?`).run(...values, new Date().toISOString(), id)
}
