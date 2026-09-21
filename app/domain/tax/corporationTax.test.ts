import { describe, expect, it } from 'vitest'
import { calculateCorporationTax, calculateCorporationTaxForPeriod, apportionAcrossFinancialYears, periodSpansDifferingFinancialYearRates, ratesFor, splitPeriodByFinancialYear, type CorporationTaxRates } from './corporationTax'

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

describe('splitPeriodByFinancialYear', () => {
  it('returns a single segment for a period within one Financial Year', () => {
    const segments = splitPeriodByFinancialYear('2024-04-01', '2025-03-31')
    expect(segments).toEqual([{ fyStartYear: 2024, from: '2024-04-01', to: '2025-03-31', days: 365 }])
  })

  it('splits a period straddling 1 April into two Financial-Year segments', () => {
    // 2025-01-01 to 2025-12-31: FY2024 portion is 1 Jan - 31 Mar (90 days), FY2025 portion is 1 Apr - 31 Dec (275 days).
    const segments = splitPeriodByFinancialYear('2025-01-01', '2025-12-31')
    expect(segments).toEqual([
      { fyStartYear: 2024, from: '2025-01-01', to: '2025-03-31', days: 90 },
      { fyStartYear: 2025, from: '2025-04-01', to: '2025-12-31', days: 275 }
    ])
  })
})

describe('periodSpansDifferingFinancialYearRates', () => {
  it('is false for a period within one Financial Year', () => {
    expect(periodSpansDifferingFinancialYearRates('2024-04-01', '2025-03-31')).toBe(false)
  })

  it('is false for a period straddling 1 April while rates are unchanged (true today)', () => {
    expect(periodSpansDifferingFinancialYearRates('2025-01-01', '2025-12-31')).toBe(false)
  })
})

describe('calculateCorporationTaxForPeriod', () => {
  it('matches calculateCorporationTax for a straddling period since current rates are unchanged across Financial Years', () => {
    const straddling = calculateCorporationTaxForPeriod(100_000, 0, { periodStart: '2025-01-01', periodEnd: '2025-12-31' })
    const whole = calculateCorporationTax(100_000, 0, rates)
    expect(straddling.corporationTax).toBe(whole.corporationTax)
    expect(straddling.segments).toBeUndefined()
  })
})

describe('apportionAcrossFinancialYears', () => {
  // Fabricated rates standing in for a real future rate change, since
  // today's Financial Years all share identical rates — exercises the
  // apportionment arithmetic calculateCorporationTaxForPeriod can't
  // currently reach through real rate lookups.
  const fy1: CorporationTaxRates = { version: 'FY-test-1', smallProfitsRate: 0.10, mainRate: 0.20, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }
  const fy2: CorporationTaxRates = { version: 'FY-test-2', smallProfitsRate: 0.15, mainRate: 0.30, lowerLimit: 50_000, upperLimit: 250_000, marginalReliefFraction: 1 / 100 }

  it('apportions taxable profit by day count and taxes each segment at its own rate', () => {
    // 10,000 total profit, split 90/275 days across a full 365-day period — both segments' day-scaled
    // lower limit (50,000 x their own day share) stays above their apportioned profit share, so both
    // sit at the small profits rate.
    const result = apportionAcrossFinancialYears(10_000, 0, [
      { fyStartYear: 2024, days: 90, rates: fy1 },
      { fyStartYear: 2025, days: 275, rates: fy2 }
    ])
    const profit1 = 10_000 * 90 / 365
    const profit2 = 10_000 * 275 / 365
    expect(result.segments).toHaveLength(2)
    expect(result.segments![0]).toMatchObject({ fyStartYear: 2024, days: 90, profit: profit1 })
    expect(result.segments![1]).toMatchObject({ fyStartYear: 2025, days: 275, profit: profit2 })
    // Both segments' day-scaled lower limits (50,000 * days/365) exceed their apportioned profit, so both sit at the small profits rate.
    const expectedTax = Math.floor(profit1 * fy1.smallProfitsRate + profit2 * fy2.smallProfitsRate)
    expect(result.corporationTax).toBe(expectedTax)
    expect(result.rateNote).toContain('FY-test-1')
    expect(result.rateNote).toContain('FY-test-2')
  })

  it('rounds only the combined total, not each segment', () => {
    const result = apportionAcrossFinancialYears(100_000, 0, [
      { fyStartYear: 2024, days: 90, rates: fy1 },
      { fyStartYear: 2025, days: 275, rates: fy2 }
    ])
    const unroundedTotal = result.segments!.reduce((sum, s) => sum + s.tax, 0)
    expect(result.corporationTax).toBe(Math.floor(unroundedTotal))
    // At least one segment's own tax is not a whole number, confirming rounding didn't happen per segment.
    expect(result.segments!.some(s => !Number.isInteger(s.tax))).toBe(true)
  })

  it('reports the later Financial Year\'s rates as the aggregate `rates` field', () => {
    const result = apportionAcrossFinancialYears(100_000, 0, [
      { fyStartYear: 2024, days: 90, rates: fy1 },
      { fyStartYear: 2025, days: 275, rates: fy2 }
    ])
    expect(result.rates).toBe(fy2)
  })
})
