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
})
