import { describe, expect, it } from 'vitest'
import { generateTaxComputationIxbrl } from './taxComputationIxbrl'
import { ratesFor, calculateCorporationTax } from '../tax/corporationTax'
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
})
