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

/** A best-effort approximation of exclusive XML canonicalisation
 *  (strips the declaration and comments, collapses insignificant
 *  whitespace between elements, sorts each element's attributes
 *  alphabetically). This is NOT a conformant W3C C14N implementation —
 *  real C14N also normalises namespace declarations, character/entity
 *  references and attribute value whitespace more strictly than this
 *  does. Treat IRmark values produced from this as unverified until
 *  checked against HMRC's published algorithm and a real C14N library. */
function approximateCanonicalize(xml: string): string {
  let s = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/>\s+</g, '><').trim()
  s = s.replace(/<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, selfClose) => {
    const pairs = [...(attrs as string).matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1]!, m[2]!] as [string, string])
    pairs.sort((a, b) => a[0].localeCompare(b[0]))
    const attrStr = pairs.map(([k, v]) => ` ${k}="${v}"`).join('')
    return `<${name}${attrStr}${selfClose}>`
  })
  return s
}

/** Best-effort implementation of HMRC's published IRmark algorithm:
 *  canonicalise the submission body, SHA-1 digest it, base64-encode the
 *  result. Runs client-side via Web Crypto — the body must NOT yet
 *  contain the IRmark element itself (it's computed over everything the
 *  IRmark then gets inserted next to). */
export async function computeIRmark(bodyXml: string): Promise<string> {
  const canonical = approximateCanonicalize(bodyXml)
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

/** Builds the GovTalk envelope wrapping a CT600 IRenvelope body. The
 *  caller supplies `bodyXml` (the IRenvelope-specific tax return content,
 *  including tagged iXBRL attachments) and a pre-computed IRmark. */
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
    <IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <Keys><Key Type="UTR">${esc(input.companyUtr)}</Key></Keys>
        <PeriodEnd>${esc(input.periodEnd)}</PeriodEnd>
        <Principal><Contact><Name><Company>${esc(input.companyName)}</Company></Name></Contact></Principal>
        <IRmark Type="generic">${esc(input.irMark)}</IRmark>
        <Sender>Company</Sender>
      </IRheader>
      ${input.bodyXml}
    </IRenvelope>
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
