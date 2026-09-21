// Actively polls Companies House for the status of a previously submitted
// accounts document (TIS v5.3 §2.5, GetSubmissionStatus "option 1" — a
// specific SubmissionNumber). Unlike /api/hmrc/poll-ct600 (which needs the
// filer's own Government Gateway credentials passed in again each time),
// this needs TaxInANutshell's own Presenter ID / Presenter Authentication
// Code — read from server env vars, same as submit-accounts.post.ts,
// never held in or sent from the browser.

import { createHash } from 'node:crypto'
import { getSubmission, updateSubmission, nextChTransactionId } from '../../utils/db'
import { buildCompaniesHouseStatusPollEnvelope, parseCompaniesHouseStatusPollResponse } from '../../../app/domain/filing/companiesHouseGovTalk'

/** Maps Companies House's raw <StatusCode> (ACCEPT/REJECT/PENDING/PARKED,
 *  per its published GetSubmissionStatus example) onto this app's
 *  SubmissionStatus union (see app/domain/filing/submissionStatus.ts). */
function mapChStatus(raw: string | undefined, rejectMessage: string | undefined): { status: string; message: string } {
  switch (raw?.toLowerCase()) {
    case 'accept':
      return { status: 'accepted', message: 'Companies House has accepted the accounts.' }
    case 'reject':
      return { status: 'rejected', message: rejectMessage || 'Companies House rejected the accounts.' }
    case 'pending':
      return { status: 'submitted', message: 'Still being processed by Companies House.' }
    case 'parked':
      return { status: 'submitted', message: 'Companies House is waiting on further information before continuing to process this submission.' }
    default:
      return { status: 'submitted', message: rejectMessage || 'No definitive status returned yet.' }
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id: string
    email: string
  }>(event)
  if (!body?.id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const row = await getSubmission(body.id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Unknown submission' })
  if (!row.ch_submission_number) {
    throw createError({ statusCode: 400, statusMessage: 'No Companies House submission is on record for this id yet' })
  }

  const config = useRuntimeConfig()
  if (!config.companiesHousePresenterId || !config.companiesHousePresenterAuthCode) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Companies House presenter credentials are not configured on this server (NUXT_COMPANIES_HOUSE_PRESENTER_ID / _PRESENTER_AUTH_CODE)'
    })
  }
  const senderIdHash = createHash('md5').update(config.companiesHousePresenterId, 'utf8').digest('hex')
  const authValueHash = createHash('md5').update(config.companiesHousePresenterAuthCode, 'utf8').digest('hex')
  const transactionId = String(await nextChTransactionId())

  const envelopeXml = buildCompaniesHouseStatusPollEnvelope({
    credentials: { email: body.email },
    // Server-controlled, not client-supplied — see the
    // companiesHouseGatewayTest comment in nuxt.config.ts.
    gatewayTest: config.companiesHouseGatewayTest as boolean,
    transactionId,
    submissionNumber: row.ch_submission_number,
    senderIdHash, authValueHash
  })

  try {
    const response = await fetch(config.companiesHouseGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: envelopeXml
    })
    const text = await response.text()
    const parsed = parseCompaniesHouseStatusPollResponse(text)
    const { status, message } = mapChStatus(parsed.status, parsed.rejectMessage)
    await updateSubmission(body.id, { ch_status: status, ch_message: message, ch_raw_response: text, ch_transaction_id: transactionId })
  } catch (err) {
    await updateSubmission(body.id, { ch_message: `Could not reach Companies House gateway: ${(err as Error).message}` })
  }

  return { row: await getSubmission(body.id) }
})
