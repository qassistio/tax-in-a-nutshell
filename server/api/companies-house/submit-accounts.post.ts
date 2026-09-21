// Submits a real Companies House XML Gateway accounts envelope (see
// app/domain/filing/companiesHouseGovTalk.ts) to
// https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway and records the
// resulting status against a GUID-keyed row in the local SQLite store
// (server/utils/db.ts) — status metadata only, no accounting figures, no
// credentials.
//
// Unlike HMRC's CT600 gateway, Companies House parses BOTH the GovTalk
// envelope AND the embedded iXBRL synchronously (TIS v5.9) — a
// `response`/`error` qualifier is the expected first reply, not
// necessarily an `acknowledgement` requiring a separate poll. This route
// records whichever qualifier comes back; further asynchronous processing
// against the SubmissionNumber (once parsing succeeds) would need a
// dedicated poll route the same way HMRC's does — not yet built, since
// there's no confirmed poll-request shape for CH in the source material
// this was built from (see the CAVEAT in companiesHouseGovTalk.ts).

import { createSubmission, getSubmission, updateSubmission } from '../../utils/db'
import { parseCompaniesHouseResponse } from '../../../app/domain/filing/companiesHouseGovTalk'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    envelopeXml: string
    companyName: string
    periodEnd: string
    transactionId: string
    submissionNumber: string
  }>(event)
  if (!body?.envelopeXml) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelopeXml' })
  }

  const config = useRuntimeConfig()
  const id = body.id && getSubmission(body.id) ? body.id : crypto.randomUUID()
  if (!getSubmission(id)) {
    createSubmission({ id, companyName: body.companyName ?? '', periodEnd: body.periodEnd ?? '' })
  }
  updateSubmission(id, {
    ch_transaction_id: body.transactionId,
    ch_submission_number: body.submissionNumber,
    ch_status: 'validated'
  })

  try {
    const response = await fetch(config.companiesHouseGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: body.envelopeXml
    })
    const text = await response.text()
    const parsed = parseCompaniesHouseResponse(text)

    if (parsed.qualifier === 'error') {
      updateSubmission(id, {
        ch_status: 'rejected',
        ch_raw_response: text,
        ch_message: parsed.errors.map(e => e.text).join('; ')
      })
    } else if (parsed.qualifier === 'acknowledgement') {
      updateSubmission(id, {
        ch_status: 'submitted',
        ch_raw_response: text,
        ch_message: 'Companies House acknowledged the submission and is processing it.'
      })
    } else if (parsed.qualifier === 'response') {
      updateSubmission(id, {
        ch_status: 'accepted',
        ch_raw_response: text,
        ch_message: 'Companies House accepted and parsed the accounts submission.'
      })
    } else {
      updateSubmission(id, {
        ch_status: response.ok ? 'submitted' : 'rejected',
        ch_raw_response: text,
        ch_message: `Unrecognised Companies House response (HTTP ${response.status}) — could not determine qualifier.`
      })
    }

    return { id }
  } catch (err) {
    updateSubmission(id, { ch_status: 'rejected', ch_message: `Could not reach Companies House gateway: ${(err as Error).message}` })
    return { id }
  }
})
