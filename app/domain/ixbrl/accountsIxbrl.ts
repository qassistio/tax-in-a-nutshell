// requirements.md §19/§20 — generates a structurally valid XHTML + inline
// XBRL document for FRS 105 micro-entity accounts: ix:header, one instant
// context (balance sheet date) and one duration context (the period), a
// GBP unit, and ix:nonFraction facts tagged against the FRS 105 taxonomy.
//
// CAVEAT (requirements.md §19: "AI should not dynamically guess filing
// tags during production filing"): the element names below are the
// author's best-effort reading of the published FRS 105 taxonomy and are
// NOT verified against HMRC/FRC's current taxonomy pack. Treat this as a
// structural draft to review against the real taxonomy before any real
// submission — never file it unchecked.

import { accountsTaxonomyFor } from './taxonomy'
import type { CompanyDetails, AccountingPeriod, BalanceSheetFigures, ProfitAndLossFigures } from '../types'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fact(name: string, prefix: string, contextRef: string, unitRef: string, amount: number, id: string): string {
  const sign = amount < 0 ? ' sign="-"' : ''
  const value = Math.abs(Math.round(amount))
  return `<ix:nonFraction name="${prefix}:${name}" contextRef="${contextRef}" unitRef="${unitRef}" decimals="0"${sign} id="${id}">${value}</ix:nonFraction>`
}

export interface AccountsIxbrlInput {
  company: CompanyDetails
  period: AccountingPeriod
  balance: BalanceSheetFigures
  pnl: ProfitAndLossFigures
}

export function generateAccountsIxbrl(input: AccountsIxbrlInput): string {
  const { company, period, balance, pnl } = input
  const taxonomy = accountsTaxonomyFor(period.periodEnd)
  const p = taxonomy.prefix

  const cInstant = 'ctx-bs'
  const cDuration = 'ctx-pl'
  const cEntity = esc(company.companyNumber || 'unknown')
  const uGBP = 'u-gbp'

  const fixedAndCurrent = balance.fixedAssets + balance.currentAssets + balance.prepayments
  const netCurrentLiabilities = balance.creditorsWithin
  const netAssets = fixedAndCurrent - balance.creditorsWithin - balance.creditorsAfter - balance.provisions
  const profitBeforeTax = pnl.turnover + pnl.otherIncome - pnl.rawMaterials - pnl.staffCosts - pnl.depreciation - pnl.otherCharges

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
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
      <xbrli:context id="${cDuration}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(period.periodStart)}</xbrli:startDate>
          <xbrli:endDate>${esc(period.periodEnd)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
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
    <tr><td>Called up share capital not paid</td><td>${fact('CalledUpShareCapitalNotPaid', p, cInstant, uGBP, balance.unpaidCapital, 'f-unpaid')}</td></tr>
    <tr><td>Fixed assets</td><td>${fact('FixedAssets', p, cInstant, uGBP, balance.fixedAssets, 'f-fixed')}</td></tr>
    <tr><td>Current assets</td><td>${fact('CurrentAssets', p, cInstant, uGBP, balance.currentAssets, 'f-current')}</td></tr>
    <tr><td>Prepayments and accrued income</td><td>${fact('PrepaymentsAccruedIncome', p, cInstant, uGBP, balance.prepayments, 'f-prepay')}</td></tr>
    <tr><td>Creditors: amounts falling due within one year</td><td>${fact('CreditorsDueWithinOneYear', p, cInstant, uGBP, balance.creditorsWithin, 'f-credwithin')}</td></tr>
    <tr><td>Creditors: amounts falling due after one year</td><td>${fact('CreditorsDueAfterOneYear', p, cInstant, uGBP, balance.creditorsAfter, 'f-credafter')}</td></tr>
    <tr><td>Provisions for liabilities</td><td>${fact('ProvisionsForLiabilities', p, cInstant, uGBP, balance.provisions, 'f-provisions')}</td></tr>
    <tr><td>Net assets</td><td>${fact('NetAssetsLiabilities', p, cInstant, uGBP, netAssets, 'f-netassets')}</td></tr>
    <tr><td>Called up share capital</td><td>${fact('ShareCapital', p, cInstant, uGBP, balance.shareCapital, 'f-sharecap')}</td></tr>
    <tr><td>Profit and loss account</td><td>${fact('ProfitLossAccountReserve', p, cInstant, uGBP, balance.retained, 'f-retained')}</td></tr>
  </table>

  <h2>Profit and loss account for the period ended ${esc(period.periodEnd)}</h2>
  <table>
    <tr><td>Turnover</td><td>${fact('TurnoverRevenue', p, cDuration, uGBP, pnl.turnover, 'f-turnover')}</td></tr>
    <tr><td>Other income</td><td>${fact('OtherOperatingIncomeFormat2', p, cDuration, uGBP, pnl.otherIncome, 'f-otherincome')}</td></tr>
    <tr><td>Cost of raw materials and consumables</td><td>${fact('RawMaterialsConsumables', p, cDuration, uGBP, pnl.rawMaterials, 'f-rawmat')}</td></tr>
    <tr><td>Staff costs</td><td>${fact('StaffCostsEmployeeBenefitsExpense', p, cDuration, uGBP, pnl.staffCosts, 'f-staff')}</td></tr>
    <tr><td>Depreciation and other amounts written off assets</td><td>${fact('DepreciationOtherAmountsWrittenOffTangibleIntangibleFixedAssets', p, cDuration, uGBP, pnl.depreciation, 'f-depn')}</td></tr>
    <tr><td>Other charges</td><td>${fact('OtherOperatingExpensesFormat2', p, cDuration, uGBP, pnl.otherCharges, 'f-othercharges')}</td></tr>
    <tr><td>Profit or loss before tax</td><td>${fact('ProfitLossOnOrdinaryActivitiesBeforeTax', p, cDuration, uGBP, profitBeforeTax, 'f-pbt')}</td></tr>
  </table>

  <p><em>Draft structural document — element names have not been verified against the
  current ${esc(taxonomy.version)} taxonomy pack. Review before filing.</em></p>
</body>
</html>
`
}
