// Drizzle schema for the ONE table this app persists server-side — see
// the module comment in server/utils/db.ts for what it holds.
//
// Field names stay snake_case (matching DB columns exactly) rather than
// idiomatic Drizzle camelCase, since the row shape is used verbatim across
// every server route and useFilingWizard.ts's SubmissionRowDto.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  company_name: text('company_name'),
  period_end: text('period_end'),
  hmrc_message_class: text('hmrc_message_class'),
  hmrc_status: text('hmrc_status').notNull().default('created'),
  hmrc_correlation_id: text('hmrc_correlation_id'),
  hmrc_poll_endpoint: text('hmrc_poll_endpoint'),
  hmrc_poll_interval_seconds: integer('hmrc_poll_interval_seconds'),
  hmrc_submission_id: text('hmrc_submission_id'),
  hmrc_irmark: text('hmrc_irmark'),
  hmrc_payload_hash: text('hmrc_payload_hash'),
  hmrc_raw_response: text('hmrc_raw_response'),
  hmrc_message: text('hmrc_message'),
  ch_status: text('ch_status'),
  ch_message: text('ch_message'),
  ch_transaction_id: text('ch_transaction_id'),
  ch_submission_number: text('ch_submission_number'),
  ch_raw_response: text('ch_raw_response'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
})

/** Companies House's <TransactionID> must strictly increase across the
 *  presenter's whole XML Gateway history (see nextChTransactionId in
 *  server/utils/db.ts) — this single-row-per-name table is where that
 *  running value lives. */
export const counters = sqliteTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull()
})
