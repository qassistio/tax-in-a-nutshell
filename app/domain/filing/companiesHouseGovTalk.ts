// Companies House's real accounts-filing channel: the XML Gateway,
// documented in Companies House's Technical Interface Specification (TIS)
// — general envelope/auth/testing behaviour in TIS v5.3, accounts-specific
// rules in the Technical Interface Specification for Accounts v5.9
// (1 April 2026). This is a GovTalk-based gateway like HMRC's CT600
// channel (see govTalk.ts) but with materially different authentication
// and framing:
//  - Same URL for test and live traffic — differentiated with a
//    <GatewayTest>true|false</GatewayTest> flag, not a different <Class>.
//  - <SenderID> and <Authentication><Value> are lowercase MD5 hashes of
//    the Presenter_ID and Presenter Authentication Code (a credit-account
//    credential CH issues to the presenter/software) — not sent in clear,
//    unlike HMRC's GovTalk auth. MD5 isn't available via the browser's
//    Web Crypto SubtleCrypto anyway, but more fundamentally these two
//    values are TaxInANutshell's own Software Filing credentials (like
//    OAuth client credentials, not the filer's) — they live in server
//    env vars and are hashed server-side, never sent to the browser at
//    all (see server/api/companies-house/submit-accounts.post.ts and
//    poll-accounts.post.ts).
//  - <TransactionID> (envelope-level, presenter-assigned, must strictly
//    increase across a session) is distinct from <SubmissionNumber>
//    (inside <FormSubmission>, presenter-assigned, must never repeat —
//    together with Presenter_ID this is CH's actual identifier for a
//    document submission, not the TransactionID).
//  - <Class>AA</Class> for Annual Accounts; <FormIdentifier> inside
//    <FormSubmission> must match it.
//  - The iXBRL accounts document is embedded as a Base64 string inside
//    <FormSubmission><Document><Data>...</Data></Document></FormSubmission>
//    — accounts are the one CH transaction type that uses ONLY the
//    FormSubmission schema, with no separate per-document-type schema
//    nested inside it.
//  - Both the GovTalk envelope AND the embedded iXBRL are parsed
//    SYNCHRONOUSLY; if either fails, the whole envelope is rejected and
//    deemed never delivered — there is no HMRC-style acknowledgement/poll
//    two-step for the initial parse (though a SubmissionNumber can still
//    be polled afterwards for the asynchronous processing that follows a
//    successful parse).
//
// CAVEAT: the source material (TIS v5.3/v5.9, extracted from Companies
// House's published ODT documents) describes the envelope-level elements
// (GovTalkMessage/Header/MessageDetails/SenderDetails) and the accounts
// Document/Data embedding in full, element-by-element. It does NOT give
// the literal FormSubmission/FormHeader field list — it says only that
// "a number of elements need to be repeated in both the <FormSubmission>
// XML and within the iXBRL accounts data... for example the company
// number is contained in both. See Filing TIS v5.0 for details" without
// reproducing that detail, and that the Company Authentication Code and
// Package Reference are data fields carried somewhere within
// <FormSubmission> (glossary: "<CompanyAuthenticationCode>" is named
// there as an actual element). The FormHeader shape below is a
// best-effort structure built from those confirmed facts — verify it
// against the real FormSubmission schema (linked from
// http://xmlgw.companieshouse.gov.uk/SchemaStatus) before a live
// submission, the same way this project already caveats the HMRC
// envelope in govTalk.ts.

export interface CompaniesHouseCredentials {
  /** Company Authentication Code — proves authority to file for this
   *  specific company, issued by Companies House to the company (visible
   *  on the CH public register cover letter / WebFiling account). This is
   *  the one credential here that legitimately comes from the browser —
   *  it's the filer's, not TaxInANutshell's. */
  companyAuthCode: string
  /** Package/software reference, issued once a developer completes CH's
   *  authorisation testing. "Any PackageReference... can be used" against
   *  the test service. This is TaxInANutshell's own, read server-side
   *  from NUXT_COMPANIES_HOUSE_PACKAGE_REFERENCE — see
   *  server/api/companies-house/submit-accounts.post.ts. */
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
  /** MD5(presenterId) and MD5(presenterAuthCode), lowercase hex — both
   *  computed server-side from env-var credentials that never reach this
   *  module's caller (see submit-accounts.post.ts / poll-accounts.post.ts). */
  senderIdHash: string
  authValueHash: string
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Base64-encodes the accounts iXBRL document for embedding in
 *  <FormSubmission><Document><Data>. Per TIS v5.9: "iXBRL documents must
 *  contain <?xml version="1.0"?> with no additional white spaces in the
 *  string declaration as the first line of the Instance" — that
 *  requirement belongs to accountsIxbrl.ts's output, not this encoding
 *  step; this function just Base64-encodes whatever it's given. */
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

/** Polls for the status of a previously submitted accounts document —
 *  TIS v5.3 §2.5, "option 1": identify the transaction by Presenter_ID
 *  (implicit in SenderID/Authentication) + <SubmissionNumber>, get back
 *  its current status (accepted/rejected/pending/parked) synchronously,
 *  no separate GetStatusAck needed for this specific-submission option.
 *
 *  CAVEAT: same as the FormSubmission body above — TIS v5.3 documents
 *  that GetSubmissionStatus takes a Presenter_ID and SubmissionNumber and
 *  returns status/Reject_message, but not the literal element nesting.
 *  The <GetSubmissionStatus><SubmissionNumber> shape below is a
 *  best-effort structure from that prose, not confirmed against the
 *  actual schema — verify before live use. */
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

/** Parses a Companies House XML Gateway response. CH's GovTalk envelope
 *  is close enough in shape to HMRC's to reuse the same regex-based,
 *  best-effort approach as parseGovTalkResponse in govTalk.ts, but it
 *  doesn't use <CorrelationID> the way HMRC does — the relevant tracking
 *  identifiers are <TransactionID> (envelope) and <SubmissionNumber>
 *  (inside FormSubmission), so this is a dedicated parser rather than a
 *  shared one. */
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
  /** TIS v5.3 §2.5: "a) accepted, b) rejected..., c) pending..., or
   *  d) parked...". Left as the raw CH term rather than mapped onto this
   *  app's SubmissionStatus union here — the caller (the poll server
   *  route) does that mapping, same division of responsibility as
   *  parseGovTalkResponse/submit-ct600.post.ts for HMRC. */
  status?: string
  rejectMessage?: string
}

/** Parses a GetSubmissionStatus poll response — distinct from
 *  parseCompaniesHouseResponse above because the poll reply's interesting
 *  content (status/Reject_message) sits inside the response body rather
 *  than at the envelope-error level. */
export function parseCompaniesHouseStatusPollResponse(xml: string): ChStatusPollResult {
  return {
    submissionNumber: extractTag(xml, 'SubmissionNumber'),
    status: extractTag(xml, 'status') ?? extractTag(xml, 'Status'),
    rejectMessage: extractTag(xml, 'Reject_message')
  }
}
