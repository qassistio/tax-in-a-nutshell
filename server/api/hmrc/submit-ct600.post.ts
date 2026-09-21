// Proxies a pre-built GovTalk envelope (see app/domain/filing/govTalk.ts)
// to HMRC's CT submission gateway. Nothing here is persisted: the request
// body — including the Government Gateway credentials embedded in the
// envelope by the browser — is forwarded and immediately discarded once
// the response is relayed back.
//
// Real, working proxy: it will genuinely call HMRC's live GovTalk gateway
// if pointed at it. It has not been exercised against a real Government
// Gateway account / vendor ID, so treat the request/response handling as
// unverified until tested against HMRC's Test-In-Live service.

export default defineEventHandler(async (event) => {
  const body = await readBody<{ envelopeXml: string }>(event)
  if (!body?.envelopeXml) {
    throw createError({ statusCode: 400, statusMessage: 'Missing envelopeXml' })
  }

  const config = useRuntimeConfig()

  try {
    const response = await fetch(config.hmrcGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: body.envelopeXml
    })
    const text = await response.text()
    return {
      ok: response.ok,
      httpStatus: response.status,
      rawResponse: text
    }
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `Could not reach HMRC gateway: ${(err as Error).message}`
    })
  }
})
