import { describe, expect, it } from 'vitest'
import { splitLongAccountingPeriod, isLongAccountingPeriod, apportionAcrossCt600Periods } from './longPeriodSplit'

describe('splitLongAccountingPeriod', () => {
  it('returns a single period unchanged when 12 months or shorter', () => {
    const periods = splitLongAccountingPeriod('2025-01-01', '2025-12-31')
    expect(periods).toEqual([{ sequence: 1, periodStart: '2025-01-01', periodEnd: '2025-12-31', days: 365 }])
  })

  it('splits a period longer than 12 months into a 12-month first period and a short remainder', () => {
    // 2025-01-01 to 2026-03-31: 15 months total.
    const periods = splitLongAccountingPeriod('2025-01-01', '2026-03-31')
    expect(periods).toEqual([
      { sequence: 1, periodStart: '2025-01-01', periodEnd: '2025-12-31', days: 365 },
      { sequence: 2, periodStart: '2026-01-01', periodEnd: '2026-03-31', days: 90 }
    ])
  })

  it('does not throw for blank or unparseable dates', () => {
    expect(() => splitLongAccountingPeriod('', '')).not.toThrow()
    expect(splitLongAccountingPeriod('', '')).toHaveLength(1)
  })
})

describe('isLongAccountingPeriod', () => {
  it('is false for a 12-month period', () => {
    expect(isLongAccountingPeriod('2025-01-01', '2025-12-31')).toBe(false)
  })

  it('is true for a period exceeding 12 months', () => {
    expect(isLongAccountingPeriod('2025-01-01', '2026-03-31')).toBe(true)
  })

  it('is false for blank dates rather than throwing', () => {
    expect(isLongAccountingPeriod('', '')).toBe(false)
  })
})

describe('apportionAcrossCt600Periods', () => {
  it('splits a total by day count across the CT periods', () => {
    const periods = splitLongAccountingPeriod('2025-01-01', '2026-03-31')
    const [first, second] = apportionAcrossCt600Periods(45_500, periods)
    expect(first).toBeCloseTo(45_500 * 365 / 455, 5)
    expect(second).toBeCloseTo(45_500 * 90 / 455, 5)
    expect(first! + second!).toBeCloseTo(45_500, 5)
  })
})
