// requirements.md §16/§20 — the actual CT600 (<CompanyTaxReturn>) XML body,
// box by box, as its own structured document distinct from the iXBRL tax
// computation/accounts attachments. Previously this project's HMRC
// submission just wrapped the tax computation iXBRL in a bare
// <CompanyTaxReturn><TaxComputation> tag, which is not what HMRC's schema
// expects — this file replaces that with the real shape, checked against
// HMRC's own published sample XML:
//  - CT600-Sample-No-attachments.xml
//  - CT600-Sample-for-inserting-iXBRL-accounts-attachments.xml
//  - CT600-Sample-for-inserting-iXBRL-computations-attachments.xml
//  (all gov.uk/assets.publishing.service.gov.uk, HMRC-published) and the
//  CT600 Guide's Box 4 "type of company" codelist.
//
// CAVEAT: same as govTalk.ts — checked against HMRC's published examples
// and guide as of 2026-09-21, not validated against the live gateway or
// the full CT600 XSD. In particular:
//  - A period straddling 1 April into a Financial Year with different
//    rates emits a second <FinancialYearTwo> block alongside
//    <FinancialYearOne> (see corporationTax.ts's calculateCorporationTaxForPeriod).
//    None of the 3 HMRC sample files are themselves a straddling example,
//    so this shape is plausible but unconfirmed — verify before relying on it live.
//  - The CT600A <Supplementary> block's element names are a best-effort
//    structural draft (no HMRC-published sample with CT600A was found) —
//    verify against the real schema before relying on it.
//  - Reliefs/charges (donations, double taxation relief, group relief) are
//    always nil, matching this product's fixed scope (requirements.md §2).
//  - Attachments use <EncodedInlineXBRLDocument> (base64), HMRC's
//    documented preference over raw <InlineXBRLDocument> — malformed XML
//    then fails HMRC's own validation with a real message instead of a
//    generic Government Gateway rejection (HMRC CT Inline XBRL Style Guide).

import type { CompanyDetails, AccountingPeriod } from '../types'
import type { CorporationTaxResult } from '../tax/corporationTax'
import type { DirectorLoanResult } from '../tax/directorLoans'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function money(amount: number): string {
  return amount.toFixed(2)
}

/** UTF-8-safe base64 encode using only globals available in both the
 *  browser (this runs client-side in useFilingWizard.ts, ssr:false) and
 *  Node under vitest (environment: 'node') — no Buffer, which the browser
 *  doesn't have. Same pattern as approval.ts's use of global crypto.subtle. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export interface Ct600Input {
  company: CompanyDetails
  period: AccountingPeriod
  /** Box "Turnover" — total turnover for the period. */
  turnover: number
  /** Trading profit after capital allowances, before loss relief —
   *  CompanyTaxCalculation/Income/Trading/Profits. */
  tradingProfit: number
  /** Brought-forward losses relieved this period —
   *  CompanyTaxCalculation/Income/Trading/LossesBroughtForward. */
  lossesRelieved: number
  result: CorporationTaxResult
  /** CT600A — only included when a Section 455 assessment applies
   *  (requirements.md §15/§17). */
  directorLoan?: DirectorLoanResult
  directorLoanBalance?: number
  accountsIxbrl: string
  taxComputationIxbrl: string
  declarantName: string
  declarantStatus: string
  /** requirements.md §31 — an amendment resubmits as the same return type;
   *  this product doesn't yet send the additional fields (e.g. original
   *  submission reference) a real amended return needs, so this only
   *  changes the ReturnType attribute for now. */
  returnType?: 'new' | 'amended'
}

/** Builds the <CompanyTaxReturn> element — the child of <IRenvelope> that
 *  govTalk.ts's buildGovTalkEnvelope embeds as `bodyXml`. */
export function buildCt600Xml(input: Ct600Input): string {
  const { company, period, turnover, tradingProfit, lossesRelieved, result, directorLoan, directorLoanBalance } = input
  const netTradingProfit = tradingProfit - lossesRelieved
  // Box 4 "type of company": 0 = none of HMRC's special categories (unit
  // trust, close investment-holding, insurance, REIT, charity, etc) apply
  // — the ordinary trading company this product's fixed scope assumes
  // (requirements.md §2).
  const companyType = '0'
  // HMRC's Financial Year is named by the calendar year it starts in
  // (1 April – 31 March); reuses the version tag corporationTax.ts's
  // ratesFor() already carries rather than re-deriving from the date.
  const fyYear = Number(result.rates.version.replace(/\D/g, '')) || new Date(period.periodEnd).getFullYear()
  const s455Due = directorLoan?.s455Due ?? 0
  const taxPayable = result.corporationTax + s455Due

  // A straddling period (result.segments set — see calculateCorporationTaxForPeriod)
  // gets one <Details> block per Financial Year; otherwise a single block
  // covering the whole period, as before.
  const financialYearBlocks = (result.segments ?? [{ fyStartYear: fyYear, profit: result.taxableTotalProfits, tax: result.corporationTax }])
    .map((seg, i) => `
      <FinancialYear${i === 0 ? 'One' : 'Two'}>
        <Year>${seg.fyStartYear}</Year>
        <Details>
          <Profit>${money(seg.profit)}</Profit>
          <TaxRate>${(seg.tax / seg.profit * 100 || 0).toFixed(2)}</TaxRate>
          <Tax>${money(seg.tax)}</Tax>
        </Details>
      </FinancialYear${i === 0 ? 'One' : 'Two'}>`)
    .join('')

  return `<CompanyTaxReturn ReturnType="${esc(input.returnType ?? 'new')}">
  <CompanyInformation>
    <CompanyName>${esc(company.companyName)}</CompanyName>
    <RegistrationNumber>${esc(company.companyNumber)}</RegistrationNumber>
    <Reference>${esc(company.utr)}</Reference>
    <CompanyType>${companyType}</CompanyType>
    <PeriodCovered>
      <From>${esc(period.periodStart)}</From>
      <To>${esc(period.periodEnd)}</To>
    </PeriodCovered>
  </CompanyInformation>
  <ReturnInfoSummary>
    <Accounts>
      <ThisPeriodAccounts>yes</ThisPeriodAccounts>
    </Accounts>
    <Computations>
      <ThisPeriodComputations>yes</ThisPeriodComputations>
    </Computations>
  </ReturnInfoSummary>
  <Turnover>
    <Total>${money(turnover)}</Total>
  </Turnover>
  <CompanyTaxCalculation>
    <Income>
      <Trading>
        <Profits>${money(tradingProfit)}</Profits>
        <LossesBroughtForward>${money(lossesRelieved)}</LossesBroughtForward>
        <NetProfits>${money(netTradingProfit)}</NetProfits>
      </Trading>
    </Income>
    <ProfitsBeforeOtherDeductions>${money(netTradingProfit)}</ProfitsBeforeOtherDeductions>
    <ChargesAndReliefs>
      <ProfitsBeforeDonationsAndGroupRelief>${money(netTradingProfit)}</ProfitsBeforeDonationsAndGroupRelief>
    </ChargesAndReliefs>
    <ChargeableProfits>${money(result.taxableTotalProfits)}</ChargeableProfits>
    <CorporationTaxChargeable>${financialYearBlocks}
    </CorporationTaxChargeable>
    <CorporationTax>${money(result.corporationTax)}</CorporationTax>
    <NetCorporationTaxChargeable>${money(result.corporationTax)}</NetCorporationTaxChargeable>
    <TaxReliefsAndDeductions>
      <TotalReliefsAndDeductions>0.00</TotalReliefsAndDeductions>
    </TaxReliefsAndDeductions>
  </CompanyTaxCalculation>
  <CalculationOfTaxOutstandingOrOverpaid>
    <NetCorporationTaxLiability>${money(result.corporationTax)}</NetCorporationTaxLiability>
    <TaxChargeable>${money(result.corporationTax)}</TaxChargeable>
    <TaxPayable>${money(taxPayable)}</TaxPayable>
  </CalculationOfTaxOutstandingOrOverpaid>${directorLoan?.ct600aRequired ? `
  <!-- CT600A — Loans to participators. Best-effort structural draft: no
       HMRC-published sample with CT600A was found to check element names
       against — verify before live use. -->
  <Supplementary>
    <CT600A>
      <LoansToParticipators>
        <Loans>
          <Details>
            <BalanceOutstanding>${money(directorLoanBalance ?? 0)}</BalanceOutstanding>
            <TaxDue>${money(s455Due)}</TaxDue>
          </Details>
        </Loans>
      </LoansToParticipators>
    </CT600A>
  </Supplementary>` : ''}
  <Declaration>
    <AcceptDeclaration>yes</AcceptDeclaration>
    <Name>${esc(input.declarantName)}</Name>
    <Status>${esc(input.declarantStatus)}</Status>
  </Declaration>
  <AttachedFiles>
    <XBRLsubmission>
      <Accounts>
        <Instance>
          <EncodedInlineXBRLDocument>${toBase64(input.accountsIxbrl)}</EncodedInlineXBRLDocument>
        </Instance>
      </Accounts>
      <Computation>
        <Instance>
          <EncodedInlineXBRLDocument>${toBase64(input.taxComputationIxbrl)}</EncodedInlineXBRLDocument>
        </Instance>
      </Computation>
    </XBRLsubmission>
  </AttachedFiles>
</CompanyTaxReturn>`
}

/** A lightweight pre-submission structural check on the CT600 XML — not a
 *  real HMRC XSD validation, just a check for missing required elements
 *  and unbalanced tags, so an obviously broken document is caught before
 *  it reaches HMRC's gateway. Regex-based rather than a real XML parser,
 *  so it runs the same in the browser and under Node/vitest. */
const REQUIRED_CT600_ELEMENTS = [
  'CompanyInformation', 'RegistrationNumber', 'Reference', 'CompanyType', 'PeriodCovered',
  'Turnover', 'CompanyTaxCalculation', 'ChargeableProfits', 'CorporationTaxChargeable',
  'CorporationTax', 'Declaration', 'AttachedFiles'
]

export function validateCt600XmlShape(xml: string): string[] {
  const problems: string[] = []
  for (const el of REQUIRED_CT600_ELEMENTS) {
    if (!xml.includes(`<${el}>`) && !xml.includes(`<${el} `)) {
      problems.push(`Missing required <${el}> element.`)
    }
  }
  const opens = xml.match(/<[A-Za-z][\w.-]*(?:\s[^>]*)?>/g)?.length ?? 0
  const selfClosing = xml.match(/<[A-Za-z][\w.-]*(?:\s[^>]*)?\/>/g)?.length ?? 0
  const closes = xml.match(/<\/[A-Za-z][\w.-]*>/g)?.length ?? 0
  if (opens - selfClosing !== closes) {
    problems.push('XML tags do not balance — the document may be malformed.')
  }
  return problems
}
