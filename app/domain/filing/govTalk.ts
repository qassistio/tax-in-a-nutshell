// requirements.md §19 ("AI should not dynamically guess filing tags during
// production filing") — HMRC's Corporation Tax submission channel is NOT
// part of the modern OAuth2 Making Tax Digital API family. It is the
// legacy GovTalk/XML gateway at
// https://transaction-engine.tax.service.gov.uk/submission, authenticated
// with a Government Gateway username/password plus an HMRC-issued vendor
// ID, using message class HMRC-CT-CT600-TIL (Test-In-Live) or
// HMRC-CT-CT600 (live), with an IRmark digital signature embedded in the
// body.
//
// CAVEAT: the envelope shape below follows HMRC's published GovTalk
// schema at a structural level. It has not been validated against a real
// submission. GovTalk submissions are asynchronous (requirements.md §24:
// "Polling where required") — HMRC typically responds to the initial
// submit with an `acknowledgement` carrying a CorrelationID and a poll
// endpoint, and the real accept/reject only arrives once you poll that
// endpoint — see buildGovTalkPollEnvelope/parseGovTalkResponse below.

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

/** The `<IRenvelope>` element and everything inside it — shared between
 *  the real envelope (built with the real IRmark) and the hashing body
 *  below (built with an empty IRmark, per HMRC's published algorithm:
 *  the mark is computed with the `<IRmark>` element present but empty,
 *  never over itself). Kept as one function so the two can't drift. */
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

/** Builds the exact `<Body>` fragment HMRC's IRmark algorithm is computed
 *  over: the real `<Body>` content, IRmark left empty, with the enclosing
 *  `GovTalkMessage` envelope's namespace declaration copied onto `<Body>`
 *  explicitly (it's only implicit-by-inheritance in the full envelope,
 *  but this fragment is hashed standalone, so the declaration has to be
 *  physically present for canonicalisation to see it — HMRC's spec calls
 *  this out explicitly). Actual canonicalisation + digest happens
 *  server-side (see server/api/hmrc/compute-irmark.post.ts) using a real
 *  W3C Exclusive C14N implementation — this file stays Vue/Node-free. */
export function buildIrMarkHashingBody(input: Pick<GovTalkEnvelopeInput, 'companyUtr' | 'companyName' | 'periodEnd' | 'bodyXml'>): string {
  return `<Body xmlns="http://www.govtalk.gov.uk/CM/envelope">${buildIrEnvelopeInner({ ...input, irMark: '' })}</Body>`
}

/** Builds the GovTalk envelope wrapping a CT600 IRenvelope body. The
 *  caller supplies `bodyXml` (the IRenvelope-specific tax return content,
 *  including tagged iXBRL attachments) and a pre-computed IRmark — get
 *  the IRmark by hashing `buildIrMarkHashingBody(input)` first (see
 *  server/api/hmrc/compute-irmark.post.ts). */
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

/** GovTalk's "poll" request — sent to the poll endpoint HMRC returned
 *  with the acknowledgement, using the same CorrelationID, until a
 *  `response` or `error` qualifier comes back instead of another
 *  acknowledgement. */
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
