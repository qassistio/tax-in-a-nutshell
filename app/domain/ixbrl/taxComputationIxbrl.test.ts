import { describe, expect, it } from 'vitest'
import { generateTaxComputationIxbrl } from './taxComputationIxbrl'
import { ratesFor, calculateCorporationTax, apportionAcrossFinancialYears, type CorporationTaxRates } from '../tax/corporationTax'
import { assessDirectorLoan, directorLoanRatesFor } from '../tax/directorLoans'
import type { CompanyDetails, AccountingPeriod, TaxAdjustments } from '../types'

const company: CompanyDetails = { companyName: 'Test Ltd', companyNumber: '12345678', utr: '1234567890' } as CompanyDetails
const period: AccountingPeriod = { periodStart: '2025-01-01', periodEnd: '2025-12-31', firstPeriod: false }
const adjustments: TaxAdjustments = { addDepreciation: 500, addEntertaining: 100, capAllowances: 300, associatedCompanies: 0 }
const rates = ratesFor(period.periodEnd)
const result = calculateCorporationTax(10_000, 0, rates)

describe('generateTaxComputationIxbrl', () => {
  it('omits the CT600A section when no director loan is outstanding', () => {
    const xml = generateTaxComputationIxbrl({ company, period, profitBeforeTax: 9_700, adjustments, result })
    expect(xml).not.toContain('CT600A')
  })

  it('includes the CT600A section and reported loan balance when a CT600A is required', () => {
    const directorLoan = assessDirectorLoan({ balanceAtPeriodEnd: 5_000, repaidBeforeDue: false }, directorLoanRatesFor(period.periodEnd))
    const xml = generateTaxComputationIxbrl({
      company, period, profitBeforeTax: 9_700, adjustments, result,
      directorLoan, directorLoanBalance: 5_000
    })
    expect(xml).toContain('CT600A')
    expect(xml).toContain('TaxOnLoansToParticipators')
  })

  it('shows the losses-relieved line only when relief was used', () => {
    const withRelief = generateTaxComputationIxbrl({ company, period, profitBeforeTax: 9_700, adjustments, result, lossesRelieved: 1_000 })
    const withoutRelief = generateTaxComputationIxbrl({ company, period, profitBeforeTax: 9_700, adjustments, result })
    expect(withRelief).toContain('LossesBroughtForward')
    expect(withoutRelief).not.toContain('LossesBroughtForward')
  })

  it('tags a per-Financial-Year breakdown, reconciling with the CT600, when the result is apportioned', () => {
    const fy1: CorporationTaxRates = { version: 'FY-test-1', smallProfitsRate: 0.10, mainRate: 0.20, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }
    const fy2: CorporationTaxRates = { version: 'FY-test-2', smallProfitsRate: 0.15, mainRate: 0.30, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }
    const straddlingResult = apportionAcrossFinancialYears(10_000, 0, [
      { fyStartYear: 2024, from: '2025-01-01', to: '2025-03-31', days: 90, rates: fy1 },
      { fyStartYear: 2025, from: '2025-04-01', to: '2025-12-31', days: 275, rates: fy2 }
    ])
    const xml = generateTaxComputationIxbrl({ company, period, profitBeforeTax: 9_700, adjustments, result: straddlingResult })
    expect(xml).toContain('ctx-fy1')
    expect(xml).toContain('ctx-fy2')
    expect(xml).toContain('<xbrli:startDate>2025-01-01</xbrli:startDate>')
    expect(xml).toContain('<xbrli:endDate>2025-03-31</xbrli:endDate>')
    expect(xml).toContain('f-cttax-fy1')
    expect(xml).toContain('f-cttax-fy2')
  })
})
