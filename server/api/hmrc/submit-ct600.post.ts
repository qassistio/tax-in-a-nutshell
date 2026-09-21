// Builds the GovTalk envelope (govTalk.ts) and proxies it to HMRC's CT
// gateway, recording status against a GUID-keyed row (server/utils/db.ts)
// — status metadata only.
//
// Envelope is built here, not in the browser, so the message Class
// (Test-In-Live vs live — hmrcTestInLive) is a server-only decision; the
// browser supplies the IRenvelope body, a pre-computed IRmark
// (compute-irmark.post.ts) and Gateway credentials per-request, never stored.
//
// GovTalk is asynchronous: the immediate reply is normally an
// `acknowledgement` with a CorrelationID + poll endpoint, not the real
// accept/reject — that arrives once /api/hmrc/poll-ct600 is called.

import { createHash } from 'node:crypto'
import { createSubmission, updateSubmission } from '../../utils/db'
import { buildGovTalkEnvelope, parseGovTalkResponse, type CtMessageClass } from '../../../app/domain/filing/govTalk'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    bodyXml: string
    companyUtr: string
    companyName: string
    periodEnd: string
    irMark: string
    gatewayUserId: string
    gatewayPassword: string
    vendorId: string
  }>(event)
  if (!body?.bodyXml || !body?.companyUtr) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bodyXml or companyUtr' })
  }

  const config = useRuntimeConfig()
  // Server-controlled, not client-supplied — see hmrcTestInLive in nuxt.config.ts.
  const messageClass: CtMessageClass = (config.hmrcTestInLive as boolean) ? 'HMRC-CT-CT600-TIL' : 'HMRC-CT-CT600'

  const envelopeXml = buildGovTalkEnvelope({
    messageClass,
    credentials: { gatewayUserId: body.gatewayUserId, gatewayPassword: body.gatewayPassword, vendorId: body.vendorId },
    companyUtr: body.companyUtr,
    companyName: body.companyName,
    periodEnd: body.periodEnd,
    bodyXml: body.bodyXml,
    irMark: body.irMark
  })
  // SHA-256 of the exact bytes sent (requirements.md §29's "payload hashes").
  const payloadHash = createHash('sha256').update(envelopeXml, 'utf8').digest('hex')

  const id = crypto.randomUUID()
  await createSubmission({ id, companyName: body.companyName ?? '', periodEnd: body.periodEnd ?? '' })
  await updateSubmission(id, {
    hmrc_message_class: messageClass,
    hmrc_irmark: body.irMark,
    hmrc_payload_hash: payloadHash,
    hmrc_status: 'validated'
  })

  try {
    const response = await fetch(config.hmrcGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: envelopeXml
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
