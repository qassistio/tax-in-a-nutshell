import { describe, expect, it } from 'vitest'
import { classifyAccountName, parseTrialBalanceCsv, summariseTrialBalance } from './trialBalanceImport'

describe('classifyAccountName', () => {
  it('maps recognisable account names to their canonical account', () => {
    expect(classifyAccountName('Office equipment')).toBe('fixedAssets')
    expect(classifyAccountName('Trade debtors')).toBe('currentAssets')
    expect(classifyAccountName('Loan due after more than one year')).toBe('creditorsAfter')
    expect(classifyAccountName('Trade creditors')).toBe('creditorsWithin')
    expect(classifyAccountName('Called up share capital')).toBe('shareCapital')
    expect(classifyAccountName('Retained earnings')).toBe('retained')
    expect(classifyAccountName('Consultancy income')).toBe('turnover')
    expect(classifyAccountName('Subcontractor costs')).toBe('rawMaterials')
    expect(classifyAccountName('Salaries and wages')).toBe('staffCosts')
    expect(classifyAccountName('Depreciation charge')).toBe('depreciation')
    expect(classifyAccountName('Rent and rates')).toBe('otherCharges')
  })

  it('returns null for anything it does not recognise, rather than guessing', () => {
    expect(classifyAccountName('Suspense account')).toBeNull()
  })
})

describe('parseTrialBalanceCsv', () => {
  it('parses a debit/credit CSV and classifies each row', () => {
    const csv = [
      'Code,Name,Debit,Credit',
      '4000,Sales,,10000',
      '7000,Rent,500,'
    ].join('\n')
    const rows = parseTrialBalanceCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ code: '4000', name: 'Sales', debit: 0, credit: 10_000, mapsTo: 'turnover' })
    // Income is credit-positive, so amount should read +10,000 not -10,000.
    expect(rows[0]!.amount).toBe(10_000)
    expect(rows[1]).toMatchObject({ code: '7000', name: 'Rent', debit: 500, credit: 0, mapsTo: 'otherCharges' })
    expect(rows[1]!.amount).toBe(500)
  })

  it('falls back to a single amount column, using sign to infer debit vs credit', () => {
    const csv = ['Name,Amount', 'Sales,10000', 'Rent,-500'].join('\n')
    const rows = parseTrialBalanceCsv(csv)
    expect(rows[0]).toMatchObject({ debit: 10_000, credit: 0 })
    expect(rows[1]).toMatchObject({ debit: 0, credit: 500 })
  })

  it('skips rows with no account name', () => {
    const csv = ['Name,Debit,Credit', ',100,', 'Rent,50,'].join('\n')
    expect(parseTrialBalanceCsv(csv)).toHaveLength(1)
  })

  it('returns an empty array for empty input', () => {
    expect(parseTrialBalanceCsv('')).toEqual([])
  })
})

describe('summariseTrialBalance', () => {
  it('sums classified rows by canonical account and separates unmatched rows', () => {
    const rows = parseTrialBalanceCsv([
      'Name,Debit,Credit',
      'Sales,,10000',
      'Consultancy income,,5000',
      'Suspense,100,'
    ].join('\n'))
    const { totals, unmatched } = summariseTrialBalance(rows)
    expect(totals.turnover).toBe(15_000)
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]!.name).toBe('Suspense')
  })
})
