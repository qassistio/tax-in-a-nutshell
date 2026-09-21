// Proxies a pre-built GovTalk envelope (see app/domain/filing/govTalk.ts)
// to HMRC's CT submission gateway, and records the resulting submission
// status against a GUID keyed row in the local SQLite store (see
// server/utils/db.ts) — status metadata only, no accounting figures.
//
// GovTalk is asynchronous: the immediate response is normally an
// `acknowledgement` carrying a CorrelationID and a poll endpoint, not the
// real accept/reject — that only arrives once /api/hmrc/poll-ct600 is
// called against the stored CorrelationID. This route stores whatever
// state that first response leaves us in and returns the submission id
// for the browser to poll against.

import { createSubmission, updateSubmission } from '../../utils/db'
import { parseGovTalkResponse } from '../../../app/domain/filing/govTalk'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    envelopeXml: string
    companyName: string
    periodEnd: string
    messageClass: string
    irMark: string
    payloadHash: string
  }>(event)
  if (!body?.envelopeXml) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelopeXml' })
  }

  const config = useRuntimeConfig()
  const id = crypto.randomUUID()
  await createSubmission({ id, companyName: body.companyName ?? '', periodEnd: body.periodEnd ?? '' })
  await updateSubmission(id, {
    hmrc_message_class: body.messageClass,
    hmrc_irmark: body.irMark,
    hmrc_payload_hash: body.payloadHash,
    hmrc_status: 'validated'
  })

  try {
    const response = await fetch(config.hmrcGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: body.envelopeXml
    })
    const text = await response.text()
    const parsed = parseGovTalkResponse(text)

    if (parsed.qualifier === 'acknowledgement') {
      await updateSubmission(id, {
        hmrc_status: 'submitted',
        hmrc_correlation_id: parsed.correlationId,
        hmrc_poll_endpoint: parsed.pollEndpoint ?? null,
        hmrc_poll_interval_seconds: parsed.pollIntervalSeconds ?? null,
        hmrc_raw_response: text,
        hmrc_message: 'HMRC acknowledged the submission and is processing it. Poll for the final result.'
      })
    } else if (parsed.qualifier === 'error') {
      await updateSubmission(id, {
        hmrc_status: 'rejected',
        hmrc_raw_response: text,
        hmrc_message: parsed.errors.map(e => e.text).join('; ')
      })
    } else if (parsed.qualifier === 'response') {
      await updateSubmission(id, {
        hmrc_status: 'accepted',
        hmrc_raw_response: text,
        hmrc_message: 'HMRC returned an immediate response.'
      })
    } else {
      await updateSubmission(id, {
        hmrc_status: response.ok ? 'submitted' : 'rejected',
        hmrc_raw_response: text,
        hmrc_message: `Unrecognised GovTalk response (HTTP ${response.status}) — could not determine qualifier.`
      })
    }

    return { id }
  } catch (err) {
    await updateSubmission(id, { hmrc_status: 'rejected', hmrc_message: `Could not reach HMRC gateway: ${(err as Error).message}` })
    return { id }
  }
})
