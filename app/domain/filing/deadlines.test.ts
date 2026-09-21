import { describe, expect, it } from 'vitest'
import { calculateDeadlines } from './deadlines'

describe('calculateDeadlines', () => {
  it('calculates the ordinary 12-month accounting period deadlines', () => {
    const result = calculateDeadlines('2024-01-01', '2024-12-31')
    expect(result.periodLengthDays).toBe(366) // 2024 is a leap year
    expect(result.companiesHouseDue?.toISOString().slice(0, 10)).toBe('2025-09-30')
    expect(result.corporationTaxPaymentDue?.toISOString().slice(0, 10)).toBe('2025-10-01')
    expect(result.ct600Due?.toISOString().slice(0, 10)).toBe('2025-12-31')
  })

  it('returns all-null fields for unparseable dates rather than throwing', () => {
    const result = calculateDeadlines('not-a-date', '2024-12-31')
    expect(result).toEqual({
      periodLengthDays: null,
      companiesHouseDue: null,
      corporationTaxPaymentDue: null,
      ct600Due: null
    })
  })

  it('uses the later of 21 months from incorporation or 3 months from period end for a first period', () => {
    // Incorporated 2024-01-01, first period end 2024-12-31: 21 months from incorporation
    // (October 2025) is later than 3 months from period end (March 2025).
    const result = calculateDeadlines('2024-01-01', '2024-12-31', { firstPeriod: true, incorporationDate: '2024-01-01' })
    expect(result.companiesHouseDue?.getFullYear()).toBe(2025)
    expect(result.companiesHouseDue?.getMonth()).toBe(9) // October, 0-indexed
  })

  it('uses the standard 9-months rule when firstPeriod is true but no incorporation date is known', () => {
    const result = calculateDeadlines('2024-01-01', '2024-12-31', { firstPeriod: true })
    const standard = calculateDeadlines('2024-01-01', '2024-12-31')
    expect(result.companiesHouseDue?.getTime()).toBe(standard.companiesHouseDue?.getTime())
  })

  it('reports a second Corporation Tax period when the accounting period exceeds 12 months', () => {
    const result = calculateDeadlines('2024-01-01', '2025-03-31')
    expect(result.corporationTaxPaymentDue?.toISOString().slice(0, 10)).toBe('2025-10-01')
    expect(result.ct600Due?.toISOString().slice(0, 10)).toBe('2025-12-31')
    expect(result.secondCorporationTaxPeriod).toMatchObject({ periodStart: '2025-01-01', periodEnd: '2025-03-31' })
    expect(result.secondCorporationTaxPeriod?.ct600Due.toISOString().slice(0, 10)).toBe('2026-03-31')
  })

  it('omits the second Corporation Tax period for a 12-month-or-shorter period', () => {
    const result = calculateDeadlines('2024-01-01', '2024-12-31')
    expect(result.secondCorporationTaxPeriod).toBeUndefined()
  })
})
