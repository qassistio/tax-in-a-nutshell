// requirements.md §24 "Polling where required" — called by the browser
// (e.g. each time the receipt/status page loads) for submissions still
// sitting in an intermediate state. If HMRC gave us a poll endpoint and
// CorrelationID, this sends the GovTalk poll request and updates the
// stored status; otherwise it just returns what's already on record.
//
// Needs the Government Gateway credentials again — GovTalk polls are
// authenticated the same way as the original submission — so the browser
// passes them through per-request; nothing is ever persisted here either.

import { getSubmission, updateSubmission } from '../../utils/db'
import { buildGovTalkPollEnvelope, parseGovTalkResponse, type CtMessageClass } from '../../../app/domain/filing/govTalk'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id: string; gatewayUserId?: string; gatewayPassword?: string }>(event)
  if (!body?.id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const row = getSubmission(body.id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Unknown submission' })

  const pollable = row.hmrc_status === 'submitted' && row.hmrc_correlation_id && row.hmrc_poll_endpoint
  if (!pollable || !body.gatewayUserId || !body.gatewayPassword) {
    return { row }
  }

  try {
    const pollXml = buildGovTalkPollEnvelope({
      messageClass: (row.hmrc_message_class ?? 'HMRC-CT-CT600-TIL') as CtMessageClass,
      credentials: { gatewayUserId: body.gatewayUserId, gatewayPassword: body.gatewayPassword },
      correlationId: row.hmrc_correlation_id!
    })
    const response = await fetch(row.hmrc_poll_endpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: pollXml
    })
    const text = await response.text()
    const parsed = parseGovTalkResponse(text)

    if (parsed.qualifier === 'acknowledgement') {
      // Still processing — nothing to update but the raw response.
      updateSubmission(row.id, { hmrc_raw_response: text })
    } else if (parsed.qualifier === 'response') {
      updateSubmission(row.id, { hmrc_status: 'accepted', hmrc_raw_response: text, hmrc_message: 'Accepted by HMRC.' })
    } else if (parsed.qualifier === 'error') {
      updateSubmission(row.id, {
        hmrc_status: 'rejected',
        hmrc_raw_response: text,
        hmrc_message: parsed.errors.map(e => e.text).join('; ')
      })
    }
  } catch (err) {
    // Leave the stored status as-is; a failed poll attempt isn't itself a rejection.
    updateSubmission(row.id, { hmrc_message: `Last poll attempt failed: ${(err as Error).message}` })
  }

  return { row: getSubmission(body.id) }
})
