// requirements.md §19/§20 — generates a structurally valid XHTML + inline
// XBRL document for the CT600 tax computation: accounting profit, the
// standard add-backs/deductions, taxable total profits, and the
// Corporation Tax charge, tagged against HMRC's CT taxonomy.
//
// Same caveat as accountsIxbrl.ts: element names are a best-effort
// structural draft, not verified against HMRC's current taxonomy pack.
// requirements.md §19 explicitly warns against guessing filing tags for
// production use — review before any real submission.

import { ctTaxonomyFor } from './taxonomy'
import type { CompanyDetails, AccountingPeriod, TaxAdjustments } from '../types'
import type { CorporationTaxResult } from '../tax/corporationTax'

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
}

export function generateTaxComputationIxbrl(input: TaxComputationIxbrlInput): string {
  const { company, period, profitBeforeTax, adjustments, result } = input
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
      <xbrli:unit id="${uGBP}"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
    </ix:hidden>
    <ix:references>
      <link:schemaRef xmlns:link="http://www.xbrl.org/2003/linkbase" xlink:type="simple"
        xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${taxonomy.schemaRef}" />
    </ix:references>
  </ix:header>

  <h1>${esc(company.companyName)} — Corporation Tax computation</h1>
  <p>UTR ${esc(company.utr)} — period ${esc(period.periodStart)} to ${esc(period.periodEnd)}.</p>

  <table>
    <tr><td>Profit per accounts before tax</td><td>${fact('ProfitLossOnOrdinaryActivitiesBeforeTax', p, cDuration, uGBP, profitBeforeTax, 'f-pbt')}</td></tr>
    <tr><td>Add: depreciation</td><td>${fact('DepreciationAddedBack', p, cDuration, uGBP, adjustments.addDepreciation, 'f-adddepn')}</td></tr>
    <tr><td>Add: client entertaining</td><td>${fact('EntertainmentAddedBack', p, cDuration, uGBP, adjustments.addEntertaining, 'f-addent')}</td></tr>
    <tr><td>Less: capital allowances</td><td>${fact('CapitalAllowances', p, cDuration, uGBP, adjustments.capAllowances, 'f-capall')}</td></tr>
    <tr><td>Trading profit</td><td>${fact('TradingProfitLoss', p, cDuration, uGBP, tradingProfit, 'f-tradeprofit')}</td></tr>
    <tr><td>Taxable total profits</td><td>${fact('TaxableTotalProfits', p, cDuration, uGBP, result.taxableTotalProfits, 'f-ttp')}</td></tr>
    <tr><td>Corporation Tax chargeable (${esc(result.rates.version)})</td><td>${fact('TaxChargeableTotalProfits', p, cDuration, uGBP, result.corporationTax, 'f-cttax')}</td></tr>
  </table>
  <p>${esc(result.rateNote)}</p>

  <p><em>Draft structural document — element names have not been verified against the
  current ${esc(taxonomy.version)} taxonomy pack. Review before filing.</em></p>
</body>
</html>
`
}
