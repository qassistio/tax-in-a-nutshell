import { describe, expect, it } from 'vitest'
import { createAmendment, diffFields } from './amendments'

describe('diffFields', () => {
  const labels = { turnover: 'Turnover', staffCosts: 'Staff costs' }

  it('returns only fields that actually changed', () => {
    const previous = { turnover: '100', staffCosts: '50' }
    const next = { turnover: '120', staffCosts: '50' }
    const changes = diffFields(previous, next, labels)
    expect(changes).toEqual([{ field: 'turnover', label: 'Turnover', previous: '100', next: '120' }])
  })

  it('returns no changes when nothing differs', () => {
    const same = { turnover: '100', staffCosts: '50' }
    expect(diffFields(same, same, labels)).toEqual([])
  })

  it('treats a missing field as an empty string on either side', () => {
    const changes = diffFields({}, { turnover: '100' }, { turnover: 'Turnover' })
    expect(changes).toEqual([{ field: 'turnover', label: 'Turnover', previous: '', next: '100' }])
  })
})

describe('createAmendment', () => {
  it('carries through the supplied fields and stamps a timestamp', () => {
    const amendment = createAmendment({
      sequence: 1,
      reason: 'Correction to staff costs',
      changes: [],
      taxDifference: 250,
      previousReceiptHash: 'abc123'
    })
    expect(amendment.sequence).toBe(1)
    expect(amendment.reason).toBe('Correction to staff costs')
    expect(amendment.taxDifference).toBe(250)
    expect(amendment.previousReceiptHash).toBe('abc123')
    expect(() => new Date(amendment.createdAt).toISOString()).not.toThrow()
  })
})
