import { describe, expect, it } from 'vitest'
import { calculateCorporationTax, ratesFor } from './corporationTax'

const rates = ratesFor('2025-03-31')

describe('calculateCorporationTax', () => {
  it('charges nothing on nil or negative taxable profit', () => {
    expect(calculateCorporationTax(0, 0, rates).corporationTax).toBe(0)
    expect(calculateCorporationTax(-5_000, 0, rates).corporationTax).toBe(0)
  })

  it('applies the small profits rate at and below the lower limit', () => {
    const result = calculateCorporationTax(50_000, 0, rates)
    expect(result.corporationTax).toBe(Math.floor(50_000 * 0.19))
    expect(result.rateNote).toMatch(/small profits rate/i)
  })

  it('applies the main rate at and above the upper limit', () => {
    const result = calculateCorporationTax(250_000, 0, rates)
    expect(result.corporationTax).toBe(Math.floor(250_000 * 0.25))
    expect(result.rateNote).toMatch(/main rate/i)
  })

  it('applies marginal relief between the limits', () => {
    const profits = 100_000
    const result = calculateCorporationTax(profits, 0, rates)
    const expected = Math.floor(profits * rates.mainRate - rates.marginalReliefFraction * (rates.upperLimit - profits))
    expect(result.corporationTax).toBe(expected)
    expect(result.rateNote).toMatch(/marginal relief/i)
    // Sits strictly between the small-profits-rate and main-rate charge at the same profit level.
    expect(result.corporationTax).toBeGreaterThan(Math.floor(profits * rates.smallProfitsRate))
    expect(result.corporationTax).toBeLessThan(Math.floor(profits * rates.mainRate))
  })

  it('halves the limits for one associated company', () => {
    // £50,000 taxable profit with one associated company sits at the (halved) upper limit, not the lower one.
    const withAssociate = calculateCorporationTax(50_000, 1, rates)
    const alone = calculateCorporationTax(50_000, 0, rates)
    expect(withAssociate.rateNote).toMatch(/main rate/i)
    expect(alone.rateNote).toMatch(/small profits rate/i)
    expect(withAssociate.corporationTax).toBeGreaterThan(alone.corporationTax)
  })

  it('treats a negative associated-companies count as zero rather than inflating the limits', () => {
    const negative = calculateCorporationTax(50_000, -3, rates)
    const zero = calculateCorporationTax(50_000, 0, rates)
    expect(negative.corporationTax).toBe(zero.corporationTax)
  })

  it('reports an effective rate of zero when there is no taxable profit', () => {
    expect(calculateCorporationTax(0, 0, rates).effectiveRate).toBe(0)
  })
})
