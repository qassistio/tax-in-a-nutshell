// requirements.md §19 — HMRC's Corporation Tax channel is NOT the modern
// OAuth2 Making Tax Digital API family; it's the legacy GovTalk/XML
// gateway, authenticated with a Government Gateway username/password plus
// an HMRC-issued vendor ID, message class HMRC-CT-CT600-TIL (Test-In-Live)
// or HMRC-CT-CT600 (live), with an IRmark digital signature in the body.
//
// CAVEAT: envelope shape follows HMRC's published GovTalk schema
// structurally but hasn't been validated against a real submission.
// Submissions are asynchronous (§24): submit returns an `acknowledgement`
// with a CorrelationID + poll endpoint; the real accept/reject only
// arrives on poll — see buildGovTalkPollEnvelope/parseGovTalkResponse.

export type CtMessageClass = 'HMRC-CT-CT600-TIL' | 'HMRC-CT-CT600'

export interface GovTalkSenderCredentials {
  gatewayUserId: string
  gatewayPassword: string
  vendorId: string
}

export interface GovTalkEnvelopeInput {
  messageClass: CtMessageClass
  credentials: GovTalkSenderCredentials
  companyUtr: string
  companyName: string
  periodEnd: string
  bodyXml: string
  irMark: string
  correlationId?: string
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The `<IRenvelope>` element, shared between the real envelope (real
 *  IRmark) and the hashing body below (empty IRmark, per HMRC's algorithm:
 *  the mark is computed with the element present but empty). One function
 *  so the two can't drift. */
function buildIrEnvelopeInner(input: Pick<GovTalkEnvelopeInput, 'companyUtr' | 'companyName' | 'periodEnd' | 'bodyXml'> & { irMark: string }): string {
  return `<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys><Key Type="UTR">${esc(input.companyUtr)}</Key></Keys>
        <PeriodEnd>${esc(input.periodEnd)}</PeriodEnd>
        <Principal><Contact><Name><Company>${esc(input.companyName)}</Company></Name></Contact></Principal>
        <IRmark Type="generic">${esc(input.irMark)}</IRmark>
        <Sender>Company</Sender>
      </IRheader>
      ${input.bodyXml}
    </IRenvelope>`
}

/** Builds the exact `<Body>` fragment HMRC's IRmark algorithm hashes: real
 *  content, empty IRmark, with the envelope's namespace declaration copied
 *  onto `<Body>` explicitly since this fragment is hashed standalone (only
 *  implicit-by-inheritance in the full envelope). Canonicalisation + digest
 *  happen server-side with real W3C Exclusive C14N (compute-irmark.post.ts)
 *  — this file stays Vue/Node-free. */
export function buildIrMarkHashingBody(input: Pick<GovTalkEnvelopeInput, 'companyUtr' | 'companyName' | 'periodEnd' | 'bodyXml'>): string {
  return `<Body xmlns="http://www.govtalk.gov.uk/CM/envelope">${buildIrEnvelopeInner({ ...input, irMark: '' })}</Body>`
}

/** Builds the GovTalk envelope wrapping a CT600 IRenvelope body. Caller
 *  supplies `bodyXml` and a pre-computed IRmark (hash
 *  `buildIrMarkHashingBody(input)` first — see compute-irmark.post.ts). */
export function buildGovTalkEnvelope(input: GovTalkEnvelopeInput): string {
  const timestamp = new Date().toISOString()
  const correlationId = input.correlationId ?? ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${esc(input.messageClass)}</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
      <CorrelationID>${esc(correlationId)}</CorrelationID>
      <Transformation>XML</Transformation>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(input.credentials.gatewayUserId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${esc(input.credentials.gatewayPassword)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="UTR">${esc(input.companyUtr)}</Key>
    </Keys>
    <ChannelRouting>
      <Channel>
        <URI>${esc(input.credentials.vendorId)}</URI>
        <Product>TaxInANutshell</Product>
        <Version>1.0</Version>
      </Channel>
    </ChannelRouting>
  </GovTalkDetails>
  <Body>
    ${buildIrEnvelopeInner(input)}
  </Body>
</GovTalkMessage>
<!-- generated ${esc(timestamp)}; structural draft — verify against HMRC's published GovTalk/CT schema before live use -->
`
}

export interface GovTalkPollInput {
  messageClass: CtMessageClass
  credentials: Pick<GovTalkSenderCredentials, 'gatewayUserId' | 'gatewayPassword'>
  correlationId: string
}

/** GovTalk's "poll" request, sent to the endpoint HMRC returned with the
 *  acknowledgement, same CorrelationID, until `response`/`error` replaces
 *  another acknowledgement. */
export function buildGovTalkPollEnvelope(input: GovTalkPollInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${esc(input.messageClass)}</Class>
      <Qualifier>poll</Qualifier>
      <CorrelationID>${esc(input.correlationId)}</CorrelationID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(input.credentials.gatewayUserId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value>${esc(input.credentials.gatewayPassword)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails><Keys /></GovTalkDetails>
  <Body />
</GovTalkMessage>
`
}

export interface GovTalkErrorDetail {
  number?: string
  text: string
  location?: string
}

export type GovTalkParsedResponse =
  | { qualifier: 'acknowledgement'; correlationId: string; pollEndpoint?: string; pollIntervalSeconds?: number }
  | { qualifier: 'response'; correlationId: string; bodyXml: string }
  | { qualifier: 'error'; correlationId?: string; errors: GovTalkErrorDetail[] }
  | { qualifier: 'unknown'; raw: string }

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`))
  return match?.[1]?.trim()
}

/** Parses a GovTalk response envelope. This is a regex-based, best-effort
 *  reader (no DOM/XML parser dependency) — adequate for the well-formed
 *  envelope shapes HMRC documents, but not a general XML parser. */
export function parseGovTalkResponse(xml: string): GovTalkParsedResponse {
  const qualifier = extractTag(xml, 'Qualifier')
  const correlationId = extractTag(xml, 'CorrelationID') ?? ''

  if (qualifier === 'acknowledgement') {
    const pollEndpoint = extractTag(xml, 'EndPoint')
    const pollIntervalRaw = extractTag(xml, 'PollInterval')
    return {
      qualifier: 'acknowledgement',
      correlationId,
      pollEndpoint,
      pollIntervalSeconds: pollIntervalRaw ? Number(pollIntervalRaw) : undefined
    }
  }

  if (qualifier === 'error') {
    const errorBlocks = [...xml.matchAll(/<Error>([\s\S]*?)<\/Error>/g)].map(m => m[1]!)
    const errors: GovTalkErrorDetail[] = errorBlocks.length
      ? errorBlocks.map(block => ({
          number: extractTag(block, 'Number'),
          text: extractTag(block, 'Text') ?? block.trim(),
          location: extractTag(block, 'Location')
        }))
      : [{ text: 'HMRC returned an error response with no parseable <Error> detail.' }]
    return { qualifier: 'error', correlationId, errors }
  }

  if (qualifier === 'response') {
    const bodyXml = extractTag(xml, 'Body') ?? xml
    return { qualifier: 'response', correlationId, bodyXml }
  }

  return { qualifier: 'unknown', raw: xml }
}
