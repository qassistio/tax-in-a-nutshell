import { describe, expect, it } from 'vitest'
import { balanceSheetTotals, formatPounds, parsePounds, profitAndLossTotals } from './totals'
import type { BalanceSheetFigures, ProfitAndLossFigures } from '../types'

describe('balanceSheetTotals', () => {
  const balanced: BalanceSheetFigures = {
    unpaidCapital: 0,
    fixedAssets: 10_000,
    currentAssets: 5_000,
    prepayments: 0,
    creditorsWithin: 2_000,
    creditorsAfter: 0,
    provisions: 0,
    shareCapital: 100,
    retained: 12_900
  }

  it('reports balances: true when assets equal liabilities plus equity', () => {
    const result = balanceSheetTotals(balanced)
    expect(result.difference).toBe(0)
    expect(result.balances).toBe(true)
  })

  it('reports balances: false and the exact difference when it does not balance', () => {
    const unbalanced: BalanceSheetFigures = { ...balanced, retained: 12_000 }
    const result = balanceSheetTotals(unbalanced)
    expect(result.balances).toBe(false)
    expect(result.difference).toBe(900)
  })
})

describe('profitAndLossTotals', () => {
  it('derives profit before tax from income minus costs', () => {
    const f: ProfitAndLossFigures = {
      turnover: 100_000,
      otherIncome: 1_000,
      rawMaterials: 20_000,
      staffCosts: 30_000,
      depreciation: 5_000,
      otherCharges: 6_000
    }
    expect(profitAndLossTotals(f).profitBeforeTax).toBe(40_000)
  })
})

describe('formatPounds', () => {
  it('renders negatives in accounting parenthesis form', () => {
    expect(formatPounds(-1234)).toBe('(1,234)')
  })

  it('renders positives with thousands separators', () => {
    expect(formatPounds(1234567)).toBe('1,234,567')
  })

  it('rounds to the nearest pound', () => {
    expect(formatPounds(1234.6)).toBe('1,235')
  })
})

describe('parsePounds', () => {
  it('strips currency symbols and separators', () => {
    expect(parsePounds('£1,234.00')).toBe(1234)
  })

  it('treats blank or undefined input as zero', () => {
    expect(parsePounds(undefined)).toBe(0)
    expect(parsePounds('')).toBe(0)
  })

  it('treats unparseable input as zero rather than NaN', () => {
    expect(parsePounds('n/a')).toBe(0)
  })
})
