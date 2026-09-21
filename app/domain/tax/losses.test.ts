import { describe, expect, it } from 'vitest'
import { applyLossRelief } from './losses'

describe('applyLossRelief', () => {
  it('relieves nothing and carries no losses forward when there are none brought forward and the period is profitable', () => {
    const result = applyLossRelief({ tradingResult: 10_000, lossesBroughtForward: 0 })
    expect(result.reliefUsed).toBe(0)
    expect(result.taxableAfterLosses).toBe(10_000)
    expect(result.lossesCarriedForward).toBe(0)
  })

  it('offsets brought-forward losses fully when the period profit covers them', () => {
    const result = applyLossRelief({ tradingResult: 10_000, lossesBroughtForward: 4_000 })
    expect(result.reliefUsed).toBe(4_000)
    expect(result.taxableAfterLosses).toBe(6_000)
    expect(result.lossesCarriedForward).toBe(0)
  })

  it('only relieves up to the period profit, carrying the rest forward', () => {
    const result = applyLossRelief({ tradingResult: 3_000, lossesBroughtForward: 10_000 })
    expect(result.reliefUsed).toBe(3_000)
    expect(result.taxableAfterLosses).toBe(0)
    expect(result.lossesCarriedForward).toBe(7_000)
  })

  it('adds a current-period loss to what carries forward without relieving anything', () => {
    const result = applyLossRelief({ tradingResult: -2_000, lossesBroughtForward: 1_000 })
    expect(result.reliefUsed).toBe(0)
    expect(result.taxableAfterLosses).toBe(0)
    expect(result.lossesCarriedForward).toBe(3_000)
  })

  it('treats a negative brought-forward balance as zero rather than inflating relief', () => {
    const result = applyLossRelief({ tradingResult: 5_000, lossesBroughtForward: -500 })
    expect(result.reliefUsed).toBe(0)
    expect(result.taxableAfterLosses).toBe(5_000)
  })
})
