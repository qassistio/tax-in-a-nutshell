import { describe, expect, it } from 'vitest'
import { previousPeriodFor } from './comparatives'

describe('previousPeriodFor', () => {
  it('returns the twelve months immediately before an ordinary period', () => {
    const result = previousPeriodFor('2025-01-01')
    expect(result).toEqual({ periodStart: '2024-01-01', periodEnd: '2024-12-31' })
  })

  it('returns null for an unparseable date', () => {
    expect(previousPeriodFor('not-a-date')).toBeNull()
  })
})
