import { describe, expect, it } from 'vitest'
import { calculateCapitalAllowances, capitalAllowanceRatesFor } from './capitalAllowances'

const rates = capitalAllowanceRatesFor('2025-03-31')

describe('calculateCapitalAllowances', () => {
  it('claims the full addition as AIA when under the limit', () => {
    const result = calculateCapitalAllowances({ poolBroughtForward: 0, additions: 10_000, disposals: 0, rates })
    expect(result.aiaClaimed).toBe(10_000)
    expect(result.wdaClaimed).toBe(0)
    expect(result.totalAllowances).toBe(10_000)
    expect(result.poolCarriedForward).toBe(0)
  })

  it('caps AIA at the limit and applies WDA to the rest', () => {
    const additions = rates.aiaLimit + 20_000
    const result = calculateCapitalAllowances({ poolBroughtForward: 0, additions, disposals: 0, rates })
    expect(result.aiaClaimed).toBe(rates.aiaLimit)
    expect(result.wdaClaimed).toBe(Math.round(20_000 * rates.mainPoolWdaRate))
    expect(result.poolCarriedForward).toBe(20_000 - result.wdaClaimed)
  })

  it('applies WDA to a pool brought forward with no additions', () => {
    const result = calculateCapitalAllowances({ poolBroughtForward: 10_000, additions: 0, disposals: 0, rates })
    expect(result.aiaClaimed).toBe(0)
    expect(result.wdaClaimed).toBe(Math.round(10_000 * rates.mainPoolWdaRate))
    expect(result.poolCarriedForward).toBe(10_000 - result.wdaClaimed)
  })

  it('reduces the pool by disposal proceeds before WDA', () => {
    const result = calculateCapitalAllowances({ poolBroughtForward: 5_000, additions: 0, disposals: 5_000, rates })
    expect(result.wdaClaimed).toBe(0)
    expect(result.poolCarriedForward).toBe(0)
  })

  it('never lets the pool go negative when disposals exceed it', () => {
    const result = calculateCapitalAllowances({ poolBroughtForward: 1_000, additions: 0, disposals: 5_000, rates })
    expect(result.poolCarriedForward).toBe(0)
    expect(result.wdaClaimed).toBe(0)
  })
})
