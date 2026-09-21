// requirements.md §19/§20 — generates a structurally valid XHTML + inline
// XBRL document for FRS 105 micro-entity accounts: ix:header, one instant
// context (balance sheet date) and one duration context (the period), a
// GBP unit, and ix:nonFraction facts tagged against the FRS 105 taxonomy.
//
// CAVEAT (requirements.md §19): element names were checked against a real
// downloaded copy of the FRC 2026 Taxonomy Suite (see taxonomy.ts), not
// guessed — but that check was a one-off manual exercise, not automated
// or independently reviewed. Review against the real taxonomy pack before
// any real submission.

import { accountsTaxonomyFor } from './taxonomy'
import type { CompanyDetails, AccountingPeriod, BalanceSheetFigures, ProfitAndLossFigures, ComparativeFigures } from '../types'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fact(name: string, prefix: string, contextRef: string, unitRef: string, amount: number, id: string): string {
  const sign = amount < 0 ? ' sign="-"' : ''
  const value = Math.abs(Math.round(amount))
  return `<ix:nonFraction name="${prefix}:${name}" contextRef="${contextRef}" unitRef="${unitRef}" decimals="0"${sign} id="${id}">${value}</ix:nonFraction>`
}

/** requirements.md §11 — every statutory balance sheet/P&L shows a
 *  comparative (prior-year) column. Optional: a first accounting period
 *  has nothing to compare to, so callers simply omit this. */
export interface AccountsIxbrlComparative {
  period: AccountingPeriod
  figures: ComparativeFigures
}

export interface AccountsIxbrlInput {
  company: CompanyDetails
  period: AccountingPeriod
  balance: BalanceSheetFigures
  pnl: ProfitAndLossFigures
  comparative?: AccountsIxbrlComparative
}

export function generateAccountsIxbrl(input: AccountsIxbrlInput): string {
  const { company, period, balance, pnl, comparative } = input
  const taxonomy = accountsTaxonomyFor(period.periodEnd)
  const p = taxonomy.prefix

  const cInstant = 'ctx-bs'
  const cInstantCredWithin = 'ctx-bs-cred-within'
  const cInstantCredAfter = 'ctx-bs-cred-after'
  const cDuration = 'ctx-pl'
  const cInstantPrior = 'ctx-bs-prior'
  const cInstantPriorCredWithin = 'ctx-bs-prior-cred-within'
  const cInstantPriorCredAfter = 'ctx-bs-prior-cred-after'
  const cDurationPrior = 'ctx-pl-prior'
  const cEntity = esc(company.companyNumber || 'unknown')
  const uGBP = 'u-gbp'
  const { axis, withinOneYear, afterOneYear } = taxonomy.maturityDimension

  const fixedAndCurrent = balance.fixedAssets + balance.currentAssets + balance.prepayments
  const netCurrentLiabilities = balance.creditorsWithin
  const netAssets = fixedAndCurrent - balance.creditorsWithin - balance.creditorsAfter - balance.provisions
  const profitBeforeTax = pnl.turnover + pnl.otherIncome - pnl.rawMaterials - pnl.staffCosts - pnl.depreciation - pnl.otherCharges

  // Comparative (prior-year) figures, when supplied — requirements.md §11.
  const cmp = comparative?.figures
  const cmpNetAssets = cmp
    ? cmp.fixedAssets + cmp.currentAssets + cmp.prepayments - cmp.creditorsWithin - cmp.creditorsAfter - cmp.provisions
    : 0
  const cmpProfitBeforeTax = cmp
    ? cmp.turnover + cmp.otherIncome - cmp.rawMaterials - cmp.staffCosts - cmp.depreciation - cmp.otherCharges
    : 0
  /** A comparative table cell for an instant (balance sheet) fact, or an
   *  empty cell when there's no comparative period. */
  const cmpInstantCell = (name: string, contextRef: string, amount: number, id: string) =>
    cmp ? `<td>${fact(name, p, contextRef, uGBP, amount, id)}</td>` : ''
  const cmpDurationCell = (name: string, amount: number, id: string) =>
    cmp ? `<td>${fact(name, p, cDurationPrior, uGBP, amount, id)}</td>` : ''
  const cmpHeader = comparative
    ? `<th>${esc(period.periodEnd)}</th><th>${esc(comparative.period.periodEnd)}</th>`
    : `<th>${esc(period.periodEnd)}</th>`

  // TIS v5.9 requires the Instance's first line to be exactly
  // `<?xml version="1.0"?>`, no encoding attribute — UTF-8 is XML's
  // default anyway, so omitting it just satisfies that literal rule.
  return `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
      xmlns:${p}="${taxonomy.namespace}"
      xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
      xml:lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(company.companyName)} — Micro-entity accounts — ${esc(period.periodEnd)}</title>
</head>
<body>
  <ix:header>
    <ix:hidden>
      <xbrli:context id="${cInstant}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(period.periodEnd)}</xbrli:instant></xbrli:period>
      </xbrli:context>
      <!-- Creditors is a single tagged concept in the FRC taxonomy, split
           by the "within one year" / "after more than one year" contexts
           below via the maturity dimension rather than by two differently
           named concepts — see the comment on AccountsTaxonomy in
           taxonomy.ts. -->
      <xbrli:context id="${cInstantCredWithin}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(period.periodEnd)}</xbrli:instant></xbrli:period>
        <xbrli:scenario>
          <xbrldi:explicitMember dimension="${p}:${axis}">${p}:${withinOneYear}</xbrldi:explicitMember>
        </xbrli:scenario>
      </xbrli:context>
      <xbrli:context id="${cInstantCredAfter}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(period.periodEnd)}</xbrli:instant></xbrli:period>
        <xbrli:scenario>
          <xbrldi:explicitMember dimension="${p}:${axis}">${p}:${afterOneYear}</xbrldi:explicitMember>
        </xbrli:scenario>
      </xbrli:context>
      <xbrli:context id="${cDuration}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(period.periodStart)}</xbrli:startDate>
          <xbrli:endDate>${esc(period.periodEnd)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
      ${comparative ? `<xbrli:context id="${cInstantPrior}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(comparative.period.periodEnd)}</xbrli:instant></xbrli:period>
      </xbrli:context>
      <xbrli:context id="${cInstantPriorCredWithin}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(comparative.period.periodEnd)}</xbrli:instant></xbrli:period>
        <xbrli:scenario>
          <xbrldi:explicitMember dimension="${p}:${axis}">${p}:${withinOneYear}</xbrldi:explicitMember>
        </xbrli:scenario>
      </xbrli:context>
      <xbrli:context id="${cInstantPriorCredAfter}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period><xbrli:instant>${esc(comparative.period.periodEnd)}</xbrli:instant></xbrli:period>
        <xbrli:scenario>
          <xbrldi:explicitMember dimension="${p}:${axis}">${p}:${afterOneYear}</xbrldi:explicitMember>
        </xbrli:scenario>
      </xbrli:context>
      <xbrli:context id="${cDurationPrior}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(comparative.period.periodStart)}</xbrli:startDate>
          <xbrli:endDate>${esc(comparative.period.periodEnd)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>` : ''}
      <xbrli:unit id="${uGBP}"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
    </ix:hidden>
    <ix:references>
      <link:schemaRef xmlns:link="http://www.xbrl.org/2003/linkbase" xlink:type="simple"
        xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${taxonomy.schemaRef}" />
    </ix:references>
  </ix:header>

  <h1>${esc(company.companyName)}</h1>
  <p>Company number ${esc(company.companyNumber)} — micro-entity accounts prepared under FRS 105
     for the period ${esc(period.periodStart)} to ${esc(period.periodEnd)}.</p>

  <h2>Balance sheet as at ${esc(period.periodEnd)}</h2>
  <table>
    <tr><th></th>${cmpHeader}</tr>
    <tr><td>Called up share capital not paid</td><td>${fact('CalledUpShareCapitalNotPaid', p, cInstant, uGBP, balance.unpaidCapital, 'f-unpaid')}</td>${cmpInstantCell('CalledUpShareCapitalNotPaid', cInstantPrior, cmp?.unpaidCapital ?? 0, 'f-unpaid-prior')}</tr>
    <tr><td>Fixed assets</td><td>${fact('FixedAssets', p, cInstant, uGBP, balance.fixedAssets, 'f-fixed')}</td>${cmpInstantCell('FixedAssets', cInstantPrior, cmp?.fixedAssets ?? 0, 'f-fixed-prior')}</tr>
    <tr><td>Current assets</td><td>${fact('CurrentAssets', p, cInstant, uGBP, balance.currentAssets, 'f-current')}</td>${cmpInstantCell('CurrentAssets', cInstantPrior, cmp?.currentAssets ?? 0, 'f-current-prior')}</tr>
    <tr><td>Prepayments and accrued income</td><td>${fact('PrepaymentsAccruedIncome', p, cInstant, uGBP, balance.prepayments, 'f-prepay')}</td>${cmpInstantCell('PrepaymentsAccruedIncome', cInstantPrior, cmp?.prepayments ?? 0, 'f-prepay-prior')}</tr>
    <tr><td>Creditors: amounts falling due within one year</td><td>${fact('Creditors', p, cInstantCredWithin, uGBP, balance.creditorsWithin, 'f-credwithin')}</td>${cmpInstantCell('Creditors', cInstantPriorCredWithin, cmp?.creditorsWithin ?? 0, 'f-credwithin-prior')}</tr>
    <tr><td>Creditors: amounts falling due after one year</td><td>${fact('Creditors', p, cInstantCredAfter, uGBP, balance.creditorsAfter, 'f-credafter')}</td>${cmpInstantCell('Creditors', cInstantPriorCredAfter, cmp?.creditorsAfter ?? 0, 'f-credafter-prior')}</tr>
    <tr><td>Provisions for liabilities</td><td>${fact('ProvisionsForLiabilitiesBalanceSheetSubtotal', p, cInstant, uGBP, balance.provisions, 'f-provisions')}</td>${cmpInstantCell('ProvisionsForLiabilitiesBalanceSheetSubtotal', cInstantPrior, cmp?.provisions ?? 0, 'f-provisions-prior')}</tr>
    <tr><td>Net assets</td><td>${fact('NetAssetsLiabilities', p, cInstant, uGBP, netAssets, 'f-netassets')}</td>${cmpInstantCell('NetAssetsLiabilities', cInstantPrior, cmpNetAssets, 'f-netassets-prior')}</tr>
    <tr><td>Called up share capital</td><td>${fact('ShareCapital', p, cInstant, uGBP, balance.shareCapital, 'f-sharecap')}</td>${cmpInstantCell('ShareCapital', cInstantPrior, cmp?.shareCapital ?? 0, 'f-sharecap-prior')}</tr>
    <tr><td>Profit and loss account</td><td>${fact('RetainedEarningsAccumulatedLosses', p, cInstant, uGBP, balance.retained, 'f-retained')}</td>${cmpInstantCell('RetainedEarningsAccumulatedLosses', cInstantPrior, cmp?.retained ?? 0, 'f-retained-prior')}</tr>
  </table>

  <h2>Profit and loss account for the period ended ${esc(period.periodEnd)}</h2>
  <table>
    <tr><th></th>${cmpHeader}</tr>
    <tr><td>Turnover</td><td>${fact('TurnoverRevenue', p, cDuration, uGBP, pnl.turnover, 'f-turnover')}</td>${cmpDurationCell('TurnoverRevenue', cmp?.turnover ?? 0, 'f-turnover-prior')}</tr>
    <tr><td>Other income</td><td>${fact('OtherOperatingIncomeFormat2', p, cDuration, uGBP, pnl.otherIncome, 'f-otherincome')}</td>${cmpDurationCell('OtherOperatingIncomeFormat2', cmp?.otherIncome ?? 0, 'f-otherincome-prior')}</tr>
    <tr><td>Cost of raw materials and consumables</td><td>${fact('RawMaterialsConsumables', p, cDuration, uGBP, pnl.rawMaterials, 'f-rawmat')}</td>${cmpDurationCell('RawMaterialsConsumables', cmp?.rawMaterials ?? 0, 'f-rawmat-prior')}</tr>
    <tr><td>Staff costs</td><td>${fact('StaffCostsEmployeeBenefitsExpense', p, cDuration, uGBP, pnl.staffCosts, 'f-staff')}</td>${cmpDurationCell('StaffCostsEmployeeBenefitsExpense', cmp?.staffCosts ?? 0, 'f-staff-prior')}</tr>
    <tr><td>Depreciation and other amounts written off assets</td><td>${fact('DepreciationAmortisationImpairmentExpense', p, cDuration, uGBP, pnl.depreciation, 'f-depn')}</td>${cmpDurationCell('DepreciationAmortisationImpairmentExpense', cmp?.depreciation ?? 0, 'f-depn-prior')}</tr>
    <tr><td>Other charges</td><td>${fact('OtherOperatingExpensesFormat2', p, cDuration, uGBP, pnl.otherCharges, 'f-othercharges')}</td>${cmpDurationCell('OtherOperatingExpensesFormat2', cmp?.otherCharges ?? 0, 'f-othercharges-prior')}</tr>
    <tr><td>Profit or loss before tax</td><td>${fact('ProfitLossOnOrdinaryActivitiesBeforeTax', p, cDuration, uGBP, profitBeforeTax, 'f-pbt')}</td>${cmpDurationCell('ProfitLossOnOrdinaryActivitiesBeforeTax', cmpProfitBeforeTax, 'f-pbt-prior')}</tr>
  </table>

  <p><em>Draft structural document — element names were checked against a downloaded copy of the
  ${esc(taxonomy.version)} taxonomy pack, but that check was a one-off manual exercise, not an
  independently reviewed one. Review before filing.</em></p>
</body>
</html>
`
}
