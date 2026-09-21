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
// submission and the IRmark computation is a best-effort implementation
// of HMRC's published algorithm (SHA-1 digest of the canonicalised body,
// base64-encoded) — verify both against HMRC's current spec and test
// against the Test-In-Live gateway before ever pointing this at
// HMRC-CT-CT600 (live).

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

/** Best-effort implementation of HMRC's published IRmark algorithm: a
 *  SHA-1 digest of the canonicalised (whitespace-collapsed) submission
 *  body, base64-encoded. Runs client-side via Web Crypto. */
export async function computeIRmark(bodyXml: string): Promise<string> {
  const canonical = bodyXml.replace(/>\s+</g, '><').trim()
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return b64
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
