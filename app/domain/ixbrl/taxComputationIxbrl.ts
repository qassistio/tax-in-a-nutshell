// requirements.md §19/§20 — generates a structurally valid XHTML + inline
// XBRL document for the CT600 tax computation: accounting profit,
// add-backs/deductions, taxable total profits, and the CT charge, tagged
// against HMRC's CT taxonomy.
//
// Same caveat as accountsIxbrl.ts: element names were checked against a
// real downloaded copy of HMRC's CT computational 2024-01-01 taxonomy
// (see taxonomy.ts), but as a one-off manual check, not an automated or
// independently reviewed one — review before any real submission.

import { ctTaxonomyFor } from './taxonomy'
import type { CompanyDetails, AccountingPeriod, TaxAdjustments } from '../types'
import type { CorporationTaxResult } from '../tax/corporationTax'
import type { DirectorLoanResult } from '../tax/directorLoans'

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fact(name: string, prefix: string, contextRef: string, unitRef: string, amount: number, id: string): string {
  const sign = amount < 0 ? ' sign="-"' : ''
  const value = Math.abs(Math.round(amount))
  return `<ix:nonFraction name="${prefix}:${name}" contextRef="${contextRef}" unitRef="${unitRef}" decimals="0"${sign} id="${id}">${value}</ix:nonFraction>`
}

export interface TaxComputationIxbrlInput {
  company: CompanyDetails
  period: AccountingPeriod
  profitBeforeTax: number
  adjustments: TaxAdjustments
  result: CorporationTaxResult
  /** Trading losses brought forward and relieved this period
   *  (requirements.md §14) — only shown when relief was actually used. */
  lossesRelieved?: number
  /** Section 455 / CT600A assessment on the director's loan account
   *  (requirements.md §15/§17) — only shown when a CT600A is required. */
  directorLoan?: DirectorLoanResult
  /** The loan balance the assessment above was calculated from — kept
   *  separate so CT600A shows the actual balance even when s455Due is
   *  £0 (loan repaid before the due date, but still reportable). */
  directorLoanBalance?: number
}

export function generateTaxComputationIxbrl(input: TaxComputationIxbrlInput): string {
  const { company, period, profitBeforeTax, adjustments, result, lossesRelieved, directorLoan, directorLoanBalance } = input
  const taxonomy = ctTaxonomyFor(period.periodEnd)
  const p = taxonomy.prefix

  const cDuration = 'ctx-period'
  const cEntity = esc(company.utr || 'unknown')
  const uGBP = 'u-gbp'

  const tradingProfit = profitBeforeTax + adjustments.addDepreciation + adjustments.addEntertaining - adjustments.capAllowances

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:${p}="${taxonomy.namespace}"
      xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
      xml:lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(company.companyName)} — Corporation Tax computation — ${esc(period.periodEnd)}</title>
</head>
<body>
  <ix:header>
    <ix:hidden>
      <xbrli:context id="${cDuration}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.hmrc.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(period.periodStart)}</xbrli:startDate>
          <xbrli:endDate>${esc(period.periodEnd)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
      <xbrli:unit id="${uGBP}"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>${(result.segments ?? []).map((seg, i) => `
      <xbrli:context id="ctx-fy${i + 1}">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.hmrc.gov.uk/">${cEntity}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${esc(seg.from)}</xbrli:startDate>
          <xbrli:endDate>${esc(seg.to)}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>`).join('')}
    </ix:hidden>
    <ix:references>
      <link:schemaRef xmlns:link="http://www.xbrl.org/2003/linkbase" xlink:type="simple"
        xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${taxonomy.schemaRef}" />
    </ix:references>
  </ix:header>

  <h1>${esc(company.companyName)} — Corporation Tax computation</h1>
  <p>UTR ${esc(company.utr)} — period ${esc(period.periodStart)} to ${esc(period.periodEnd)}.</p>

  <table>
    <tr><td>Profit per accounts before tax</td><td>${fact('ProfitLossPerAccounts', p, cDuration, uGBP, profitBeforeTax, 'f-pbt')}</td></tr>
    <tr><td>Add: depreciation</td><td>${fact('AdjustmentsDepreciation', p, cDuration, uGBP, adjustments.addDepreciation, 'f-adddepn')}</td></tr>
    <tr><td>Add: client entertaining</td><td>${fact('AdjustmentsEntertaining', p, cDuration, uGBP, adjustments.addEntertaining, 'f-addent')}</td></tr>
    <tr><td>Less: capital allowances</td><td>${fact('TotalCapitalAllowances', p, cDuration, uGBP, adjustments.capAllowances, 'f-capall')}</td></tr>
    <tr><td>Trading profit</td><td>${fact('NetTradingProfits', p, cDuration, uGBP, tradingProfit, 'f-tradeprofit')}</td></tr>
    ${lossesRelieved ? `<tr><td>Less: losses brought forward relieved</td><td>${fact('LossesBroughtForward', p, cDuration, uGBP, lossesRelieved, 'f-lossrelief')}</td></tr>` : ''}
    <tr><td>Taxable total profits</td><td>${fact('TotalProfitsChargeableToCorporationTax', p, cDuration, uGBP, result.taxableTotalProfits, 'f-ttp')}</td></tr>
    <tr><td>Corporation Tax chargeable (${esc(result.rates.version)})</td><td>${fact('CorporationTaxChargeable', p, cDuration, uGBP, result.corporationTax, 'f-cttax')}</td></tr>
  </table>
  <p>${esc(result.rateNote)}</p>

  ${result.segments ? `<h2>Corporation Tax by Financial Year</h2>
  <p>This period crosses 1 April into a year with a different tax rate, so profit is split between the two years below.</p>
  <table>
    ${result.segments.map((seg, i) => `
    <tr><td>${esc(seg.rates.version)} (${esc(seg.from)} to ${esc(seg.to)}, ${seg.days} days)</td>
        <td>${fact('TotalProfitsChargeableToCorporationTax', p, `ctx-fy${i + 1}`, uGBP, seg.profit, `f-ttp-fy${i + 1}`)}</td>
        <td>${fact('CorporationTaxChargeable', p, `ctx-fy${i + 1}`, uGBP, seg.tax, `f-cttax-fy${i + 1}`)}</td></tr>`).join('')}
  </table>` : ''}

  ${directorLoan?.ct600aRequired ? `<h2>CT600A — Loans to participators</h2>
  <table>
    <tr><td>Director's loan account balance at period end</td><td>${fact('LoanBalanceOutstanding', p, cDuration, uGBP, directorLoanBalance ?? 0, 'f-loanbalance')}</td></tr>
    <tr><td>Section 455 tax due</td><td>${fact('TaxOnLoansToParticipators', p, cDuration, uGBP, directorLoan.s455Due, 'f-s455')}</td></tr>
  </table>
  <p>${esc(directorLoan.explanation)}</p>` : ''}

  <p><em>Draft structural document — element names were checked against a downloaded copy of the
  ${esc(taxonomy.version)} taxonomy pack, but that check was a one-off manual exercise, not an
  independently reviewed one. Review before filing.</em></p>
</body>
</html>
`
}
