import { describe, expect, it } from 'vitest'
import { buildTaxableProfitTrail, createAuditEntry } from './auditTrail'

describe('createAuditEntry', () => {
  it('assigns an incrementing id and stamps a timestamp', () => {
    const a = createAuditEntry('import', 'Imported 10 rows')
    const b = createAuditEntry('validation', 'Balance sheet balances')
    expect(a.id).not.toBe(b.id)
    expect(a.category).toBe('import')
    expect(a.message).toBe('Imported 10 rows')
    expect(() => new Date(a.at).toISOString()).not.toThrow()
  })
})

describe('buildTaxableProfitTrail', () => {
  it('traces taxable profit back through the tax computation adjustments', () => {
    const steps = buildTaxableProfitTrail({
      taxableTotalProfits: 42_000,
      profitBeforeTax: 40_000,
      addDepreciation: 5_000,
      addEntertaining: 1_000,
      capAllowances: 4_000
    })
    expect(steps[0]).toMatchObject({ label: 'CT600 taxable total profits', amount: 42_000 })
    expect(steps.find(s => s.label.includes('Capital allowances'))?.amount).toBe(-4_000)
    expect(steps).toHaveLength(6)
  })

  it('adds an extra step when the figures were imported from a trial balance', () => {
    const steps = buildTaxableProfitTrail({
      taxableTotalProfits: 0,
      profitBeforeTax: 0,
      addDepreciation: 0,
      addEntertaining: 0,
      capAllowances: 0,
      importedFrom: { fileName: 'tb.csv', rowCount: 12 }
    })
    expect(steps).toHaveLength(7)
    expect(steps.at(-1)!.detail).toContain('tb.csv')
    expect(steps.at(-1)!.detail).toContain('12')
  })
})
