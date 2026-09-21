// Companies House's XML Gateway for accounts filing — per the Technical
// Interface Specification (TIS v5.3 general, v5.9 accounts-specific,
// 1 April 2026). GovTalk-based like HMRC's CT600 channel (govTalk.ts) but
// with different auth/framing:
//  - Same URL for test/live, differentiated by <GatewayTest>true|false</>,
//    not a different <Class>.
//  - <SenderID>/<Authentication><Value> are lowercase MD5 hashes of the
//    Presenter_ID/Presenter Authentication Code — TaxInANutshell's own
//    Software Filing credentials (not the filer's), hashed server-side
//    from env vars, never sent to the browser (see
//    submit-accounts.post.ts / poll-accounts.post.ts).
//  - <TransactionID> (envelope, must strictly increase) is distinct from
//    <SubmissionNumber> (inside <FormSubmission>, must never repeat —
//    CH's actual document identifier together with Presenter_ID).
//  - <Class>AA</Class> for Annual Accounts, matching <FormIdentifier>.
//  - iXBRL is embedded as Base64 in <FormSubmission><Document><Data>.
//  - Envelope + embedded iXBRL are parsed SYNCHRONOUSLY — no HMRC-style
//    ack/poll two-step for the initial parse, though SubmissionNumber can
//    still be polled afterwards for async processing.
//
// CAVEAT: TIS v5.3/v5.9 document the envelope and Document/Data embedding
// element-by-element, but not the literal FormSubmission/FormHeader field
// list — it just says fields like company number repeat between
// FormSubmission and the iXBRL, referring to "Filing TIS v5.0" for
// details not reproduced here. The FormHeader shape below is a
// best-effort draft — verify against the real schema
// (http://xmlgw.companieshouse.gov.uk/SchemaStatus) before live use, same
// caveat as govTalk.ts's HMRC envelope.
//
// The <SenderID>/<Authentication><Method>clear</Method><Value> shape and
// the GetSubmissionStatus response shape (<StatusCode>,
// <Rejections><Reject><Description>) below WERE checked against CH's own
// published example (xmlgw.companieshouse.gov.uk/examples/
// GetSubmissionStatus_response.xml) and its XML Gateway forum as of
// 2026-09-21 — see also TIS v5.3 §2.5.1: GetStatusAck is only required
// after GetSubmissionStatus options 2/3 (bulk poll), not option 1 (a
// specific SubmissionNumber, what this app uses), so no ack step is
// needed here.

export interface CompaniesHouseCredentials {
  /** Proves authority to file for this company, issued by CH to the
   *  company. The one credential here that legitimately comes from the
   *  browser — the filer's, not TaxInANutshell's. */
  companyAuthCode: string
  /** TaxInANutshell's own package/software reference, read server-side
   *  from NUXT_COMPANIES_HOUSE_PACKAGE_REFERENCE. */
  packageReference: string
  email: string
}

export interface CompaniesHouseAccountsSubmissionInput {
  credentials: CompaniesHouseCredentials
  gatewayTest: boolean
  companyNumber: string
  companyName: string
  transactionId: string
  submissionNumber: string
  /** Base64-encoded accounts iXBRL — see buildAccountsBase64 below. */
  accountsIxbrlBase64: string
  /** MD5(presenterId)/MD5(presenterAuthCode), lowercase hex, computed
   *  server-side (see submit-accounts.post.ts / poll-accounts.post.ts). */
  senderIdHash: string
  authValueHash: string
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Base64-encodes the accounts iXBRL for <FormSubmission><Document><Data>.
 *  TIS v5.9's "no extra whitespace before the XML declaration" rule is
 *  accountsIxbrl.ts's responsibility, not this encoding step. */
export function buildAccountsBase64(accountsIxbrl: string): string {
  return Buffer.from(accountsIxbrl, 'utf-8').toString('base64')
}

export function buildCompaniesHouseAccountsEnvelope(input: CompaniesHouseAccountsSubmissionInput): string {
  const timestamp = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>AA</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>${esc(input.transactionId)}</TransactionID>
      <GatewayTest>${input.gatewayTest ? 'true' : 'false'}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(input.senderIdHash)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${esc(input.authValueHash)}</Value>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${esc(input.credentials.email)}</EmailAddress>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys />
  </GovTalkDetails>
  <Body>
    <FormSubmission>
      <FormHeader>
        <CompanyNumber>${esc(input.companyNumber)}</CompanyNumber>
        <CompanyName>${esc(input.companyName)}</CompanyName>
        <CompanyAuthenticationCode>${esc(input.credentials.companyAuthCode)}</CompanyAuthenticationCode>
        <PackageReference>${esc(input.credentials.packageReference)}</PackageReference>
        <Language>ENGLISH</Language>
        <FormIdentifier>AA</FormIdentifier>
        <SubmissionNumber>${esc(input.submissionNumber)}</SubmissionNumber>
      </FormHeader>
      <Document>
        <Data>${input.accountsIxbrlBase64}</Data>
      </Document>
    </FormSubmission>
  </Body>
</GovTalkMessage>
<!-- generated ${esc(timestamp)}; FormHeader shape is a best-effort structural draft (see CAVEAT in companiesHouseGovTalk.ts) — verify against the real FormSubmission schema before live use -->
`
}

export interface CompaniesHouseStatusPollInput {
  credentials: Pick<CompaniesHouseCredentials, 'email'>
  gatewayTest: boolean
  transactionId: string
  submissionNumber: string
  senderIdHash: string
  authValueHash: string
}

/** Polls a submitted accounts document's status (TIS v5.3 §2.5, option 1)
 *  — identified by Presenter_ID + <SubmissionNumber>, returns
 *  accepted/rejected/pending/parked synchronously.
 *
 *  CAVEAT: same as buildCompaniesHouseAccountsEnvelope — element nesting
 *  below is a best-effort draft from TIS prose, not schema-confirmed. */
export function buildCompaniesHouseStatusPollEnvelope(input: CompaniesHouseStatusPollInput): string {
  const timestamp = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>GetSubmissionStatus</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>${esc(input.transactionId)}</TransactionID>
      <GatewayTest>${input.gatewayTest ? 'true' : 'false'}</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${esc(input.senderIdHash)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${esc(input.authValueHash)}</Value>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${esc(input.credentials.email)}</EmailAddress>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys />
  </GovTalkDetails>
  <Body>
    <GetSubmissionStatus>
      <SubmissionNumber>${esc(input.submissionNumber)}</SubmissionNumber>
    </GetSubmissionStatus>
  </Body>
</GovTalkMessage>
<!-- generated ${esc(timestamp)}; GetSubmissionStatus body shape is a best-effort structural draft — verify against the real schema before live use -->
`
}

export interface ChGovTalkErrorDetail {
  number?: string
  text: string
  location?: string
}

export type ChGovTalkParsedResponse =
  | { qualifier: 'acknowledgement'; transactionId?: string; submissionNumber?: string }
  | { qualifier: 'response'; transactionId?: string; bodyXml: string }
  | { qualifier: 'error'; errors: ChGovTalkErrorDetail[] }
  | { qualifier: 'unknown'; raw: string }

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`))
  return match?.[1]?.trim()
}

/** Parses a Companies House XML Gateway response — same regex-based,
 *  best-effort approach as parseGovTalkResponse in govTalk.ts, but a
 *  dedicated parser since CH tracks via <TransactionID>/<SubmissionNumber>
 *  rather than HMRC's <CorrelationID>. */
export function parseCompaniesHouseResponse(xml: string): ChGovTalkParsedResponse {
  const qualifier = extractTag(xml, 'Qualifier')
  const transactionId = extractTag(xml, 'TransactionID')
  const submissionNumber = extractTag(xml, 'SubmissionNumber')

  if (qualifier === 'error') {
    const errorBlocks = [...xml.matchAll(/<Error>([\s\S]*?)<\/Error>/g)].map(m => m[1]!)
    const errors: ChGovTalkErrorDetail[] = errorBlocks.length
      ? errorBlocks.map(block => ({
          number: extractTag(block, 'Number'),
          text: extractTag(block, 'Text') ?? block.trim(),
          location: extractTag(block, 'Location')
        }))
      : [{ text: 'Companies House returned an error response with no parseable <Error> detail.' }]
    return { qualifier: 'error', errors }
  }

  if (qualifier === 'acknowledgement') {
    return { qualifier: 'acknowledgement', transactionId, submissionNumber }
  }

  if (qualifier === 'response') {
    const bodyXml = extractTag(xml, 'Body') ?? xml
    return { qualifier: 'response', transactionId, bodyXml }
  }

  return { qualifier: 'unknown', raw: xml }
}

export interface ChStatusPollResult {
  submissionNumber?: string
  /** Raw CH code — <StatusCode>ACCEPT|REJECT|PENDING|PARKED</StatusCode>
   *  (TIS v5.3 §2.5's "accepted/rejected/pending/parked" prose, but that's
   *  the actual element/value CH returns per its published example at
   *  xmlgw.companieshouse.gov.uk/examples/GetSubmissionStatus_response.xml
   *  — the caller maps this onto SubmissionStatus, same as HMRC's parser). */
  status?: string
  rejectMessage?: string
}

/** Parses a GetSubmissionStatus poll response — distinct from
 *  parseCompaniesHouseResponse since these sit inside <Body><SubmissionStatus>
 *  rather than at envelope-error level. Reject detail lives in
 *  <Rejections><Reject><Description> (possibly more than one <Reject>), not
 *  a flat <Reject_message> — that name is HMRC's (see govTalk.ts), not CH's. */
export function parseCompaniesHouseStatusPollResponse(xml: string): ChStatusPollResult {
  const rejectBlocks = [...xml.matchAll(/<Reject>([\s\S]*?)<\/Reject>/g)].map(m => m[1]!)
  const rejectMessage = rejectBlocks.length
    ? rejectBlocks.map(block => extractTag(block, 'Description')).filter(Boolean).join('; ')
    : undefined

  return {
    submissionNumber: extractTag(xml, 'SubmissionNumber'),
    status: extractTag(xml, 'StatusCode'),
    rejectMessage
  }
}
