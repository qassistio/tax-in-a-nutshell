import { describe, expect, it } from 'vitest'
import { buildCt600Xml, validateCt600XmlShape } from './ct600'
import { ratesFor, calculateCorporationTax, apportionAcrossFinancialYears, type CorporationTaxRates } from '../tax/corporationTax'
import { assessDirectorLoan, directorLoanRatesFor } from '../tax/directorLoans'
import type { CompanyDetails, AccountingPeriod } from '../types'

const company: CompanyDetails = {
  companyName: 'Acme & Co Ltd', companyNumber: '12345678', utr: '1234567890', address: '1 Test St', postcode: 'AB1 2CD', sic: '62012'
}
const period: AccountingPeriod = { periodStart: '2025-01-01', periodEnd: '2025-12-31', firstPeriod: false }
const rates = ratesFor(period.periodEnd)
const result = calculateCorporationTax(10_000, 0, rates)

const baseInput = {
  company, period,
  turnover: 50_000,
  tradingProfit: 10_500,
  lossesRelieved: 500,
  result,
  accountsIxbrl: '<html><body>accounts</body></html>',
  taxComputationIxbrl: '<html><body>tax comp</body></html>',
  declarantName: 'Jo Bloggs',
  declarantStatus: 'Director'
}

describe('buildCt600Xml', () => {
  it('populates CompanyInformation, PeriodCovered and Turnover from the input', () => {
    const xml = buildCt600Xml(baseInput)
    expect(xml).toContain('<CompanyName>Acme &amp; Co Ltd</CompanyName>')
    expect(xml).toContain('<RegistrationNumber>12345678</RegistrationNumber>')
    expect(xml).toContain('<Reference>1234567890</Reference>')
    expect(xml).toContain('<From>2025-01-01</From>')
    expect(xml).toContain('<To>2025-12-31</To>')
    expect(xml).toContain('<Total>50000.00</Total>')
  })

  it('reconciles trading profit, losses relieved and chargeable profits to the corporation tax result', () => {
    const xml = buildCt600Xml(baseInput)
    expect(xml).toContain('<Profits>10500.00</Profits>')
    expect(xml).toContain('<LossesBroughtForward>500.00</LossesBroughtForward>')
    expect(xml).toContain('<NetProfits>10000.00</NetProfits>')
    expect(xml).toContain(`<ChargeableProfits>${result.taxableTotalProfits.toFixed(2)}</ChargeableProfits>`)
    expect(xml).toContain(`<CorporationTax>${result.corporationTax.toFixed(2)}</CorporationTax>`)
    expect(xml).toContain(`<TaxPayable>${result.corporationTax.toFixed(2)}</TaxPayable>`)
  })

  it('defaults ReturnType to "new" and Box 4 CompanyType to 0 (no special category)', () => {
    const xml = buildCt600Xml(baseInput)
    expect(xml).toContain('<CompanyTaxReturn ReturnType="new">')
    expect(xml).toContain('<CompanyType>0</CompanyType>')
  })

  it('marks ReturnType as "amended" when requested', () => {
    const xml = buildCt600Xml({ ...baseInput, returnType: 'amended' })
    expect(xml).toContain('<CompanyTaxReturn ReturnType="amended">')
  })

  it('omits the CT600A supplementary block when no director loan is outstanding', () => {
    const xml = buildCt600Xml(baseInput)
    expect(xml).not.toContain('CT600A')
  })

  it('includes the CT600A block and Section 455 tax due when a loan assessment requires it', () => {
    const directorLoan = assessDirectorLoan({ balanceAtPeriodEnd: 5_000, repaidBeforeDue: false }, directorLoanRatesFor(period.periodEnd))
    const xml = buildCt600Xml({ ...baseInput, directorLoan, directorLoanBalance: 5_000 })
    expect(xml).toContain('<CT600A>')
    expect(xml).toContain('<BalanceOutstanding>5000.00</BalanceOutstanding>')
    expect(xml).toContain(`<TaxDue>${directorLoan.s455Due.toFixed(2)}</TaxDue>`)
    expect(xml).toContain(`<TaxPayable>${(result.corporationTax + directorLoan.s455Due).toFixed(2)}</TaxPayable>`)
  })

  it('embeds the accounts and tax computation iXBRL as base64 EncodedInlineXBRLDocument attachments', () => {
    const xml = buildCt600Xml(baseInput)
    const accountsB64 = Buffer.from(baseInput.accountsIxbrl, 'utf-8').toString('base64')
    const compB64 = Buffer.from(baseInput.taxComputationIxbrl, 'utf-8').toString('base64')
    expect(xml).toContain('<XBRLsubmission>')
    expect(xml).toContain(`<Accounts>\n        <Instance>\n          <EncodedInlineXBRLDocument>${accountsB64}`)
    expect(xml).toContain(`<Computation>\n        <Instance>\n          <EncodedInlineXBRLDocument>${compB64}`)
  })

  it('records the declarant name and status in the Declaration block', () => {
    const xml = buildCt600Xml(baseInput)
    expect(xml).toContain('<AcceptDeclaration>yes</AcceptDeclaration>')
    expect(xml).toContain('<Name>Jo Bloggs</Name>')
    expect(xml).toContain('<Status>Director</Status>')
  })

  it('emits FinancialYearOne and FinancialYearTwo when the tax result is apportioned across a straddling period', () => {
    const fy1: CorporationTaxRates = { version: 'FY-test-1', smallProfitsRate: 0.10, mainRate: 0.20, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }
    const fy2: CorporationTaxRates = { version: 'FY-test-2', smallProfitsRate: 0.15, mainRate: 0.30, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }
    const straddlingResult = apportionAcrossFinancialYears(10_000, 0, [
      { fyStartYear: 2024, days: 90, rates: fy1 },
      { fyStartYear: 2025, days: 275, rates: fy2 }
    ])
    const xml = buildCt600Xml({ ...baseInput, result: straddlingResult })
    expect(xml).toContain('<FinancialYearOne>')
    expect(xml).toContain('<Year>2024</Year>')
    expect(xml).toContain(`<Profit>${straddlingResult.segments![0].profit.toFixed(2)}</Profit>`)
    expect(xml).toContain('<FinancialYearTwo>')
    expect(xml).toContain('<Year>2025</Year>')
    expect(xml).toContain(`<Profit>${straddlingResult.segments![1].profit.toFixed(2)}</Profit>`)
  })
})

describe('validateCt600XmlShape', () => {
  it('finds no problems in a normally-built CT600', () => {
    const xml = buildCt600Xml(baseInput)
    expect(validateCt600XmlShape(xml)).toEqual([])
  })

  it('flags a missing required element', () => {
    const xml = buildCt600Xml(baseInput).replace('<Turnover>', '<TurnoverX>').replace('</Turnover>', '</TurnoverX>')
    const problems = validateCt600XmlShape(xml)
    expect(problems.some(p => p.includes('<Turnover>'))).toBe(true)
  })

  it('flags unbalanced tags', () => {
    const xml = buildCt600Xml(baseInput).replace('</Declaration>', '')
    const problems = validateCt600XmlShape(xml)
    expect(problems.some(p => /do not balance/.test(p))).toBe(true)
  })
})
