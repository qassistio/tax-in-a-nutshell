import type { BalanceSheetFigures, ProfitAndLossFigures } from '../types'

export interface BalanceSheetTotals {
  netCurrentAssets: number
  netAssets: number
  totalShareholdersFunds: number
  /** Net assets minus shareholders' funds — zero when the sheet balances. */
  difference: number
  balances: boolean
}

/** Assets = Liabilities + Equity, per requirements.md §7 — the balance
 *  check the rest of the wizard (review, declaration) gates on. */
export function balanceSheetTotals(f: BalanceSheetFigures): BalanceSheetTotals {
  const netCurrentAssets = f.currentAssets + f.prepayments - f.creditorsWithin
  const netAssets = f.unpaidCapital + f.fixedAssets + netCurrentAssets - f.creditorsAfter - f.provisions
  const totalShareholdersFunds = f.shareCapital + f.retained
  const difference = netAssets - totalShareholdersFunds
  return {
    netCurrentAssets,
    netAssets,
    totalShareholdersFunds,
    difference,
    balances: Math.round(difference) === 0
  }
}

export interface ProfitAndLossTotals {
  profitBeforeTax: number
}

export function profitAndLossTotals(f: ProfitAndLossFigures): ProfitAndLossTotals {
  const profitBeforeTax = f.turnover + f.otherIncome - f.rawMaterials - f.staffCosts - f.depreciation - f.otherCharges
  return { profitBeforeTax }
}

/** Rounds to the nearest pound and renders negatives in accounting
 *  parenthesis form, e.g. -1234 -> "(1,234)". */
export function formatPounds(amount: number): string {
  const rounded = Math.round(amount)
  const abs = Math.abs(rounded).toLocaleString('en-GB')
  return rounded < 0 ? `(${abs})` : abs
}

export function parsePounds(raw: string | undefined): number {
  const x = parseFloat(String(raw ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isNaN(x) ? 0 : x
}
