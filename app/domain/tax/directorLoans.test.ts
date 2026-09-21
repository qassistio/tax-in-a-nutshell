import { describe, expect, it } from 'vitest'
import { assessDirectorLoan, directorLoanRatesFor } from './directorLoans'

const rates = directorLoanRatesFor('2025-03-31')

describe('assessDirectorLoan', () => {
  it('requires nothing when there was no overdrawn balance', () => {
    const result = assessDirectorLoan({ balanceAtPeriodEnd: 0, repaidBeforeDue: false }, rates)
    expect(result.ct600aRequired).toBe(false)
    expect(result.s455Due).toBe(0)
  })

  it('requires CT600A but no s.455 charge when repaid before the due date', () => {
    const result = assessDirectorLoan({ balanceAtPeriodEnd: 10_000, repaidBeforeDue: true }, rates)
    expect(result.ct600aRequired).toBe(true)
    expect(result.s455Due).toBe(0)
  })

  it('charges s.455 at the current rate on an unpaid overdrawn balance', () => {
    const result = assessDirectorLoan({ balanceAtPeriodEnd: 10_000, repaidBeforeDue: false }, rates)
    expect(result.ct600aRequired).toBe(true)
    expect(result.s455Due).toBe(Math.round(10_000 * rates.s455Rate))
  })
})
