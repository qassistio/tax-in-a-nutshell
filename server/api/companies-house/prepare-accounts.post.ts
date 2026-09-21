// Companies House does NOT currently publish a general third-party API
// for filing annual accounts. Their public "API Filing" (Transactions
// API, api.company-information.service.gov.uk) covers Registered Office
// Address, Insolvency and Registered Email Address changes only — not
// accounts/iXBRL. A software-only filing mandate under the Economic
// Crime and Corporate Transparency Act 2023 phases in HMRC CT600
// software-only filing (already in force from 1 April 2026), Companies
// House software-only filing for all companies (2027), and mandatory
// iXBRL for all CH filings (2028) — but no stable accounts-filing
// endpoint exists for third parties yet.
//
// So rather than fabricate a call to an endpoint that doesn't exist,
// this route does the honest thing available today: it records that
// accounts were prepared and returns them for the user to file
// themselves via Companies House WebFiling or their existing approved
// software. If an `id` is supplied (an existing HMRC submission record),
// the CH status is recorded against the same row so one status page
// covers both; otherwise a fresh id is created.

import { createSubmission, getSubmission, updateSubmission } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; accountsIxbrl: string; companyName: string; periodEnd: string }>(event)
  if (!body?.accountsIxbrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing accountsIxbrl' })
  }

  const message =
    'Companies House has no public third-party API for accounts filing yet (only Registered Office Address, ' +
    'Insolvency and Registered Email Address filings are exposed today). Software-only filing is being phased in ' +
    'from 2027, with mandatory iXBRL from 2028. Until then, download the accounts iXBRL and file it yourself via ' +
    'Companies House WebFiling or your existing filing software.'

  const id = body.id && getSubmission(body.id) ? body.id : crypto.randomUUID()
  if (!getSubmission(id)) {
    createSubmission({ id, companyName: body.companyName ?? '', periodEnd: body.periodEnd ?? '' })
  }
  updateSubmission(id, { ch_status: 'created', ch_message: message })

  return { id, ok: true, channel: 'manual-filing-required' as const, message, accountsIxbrl: body.accountsIxbrl }
})
