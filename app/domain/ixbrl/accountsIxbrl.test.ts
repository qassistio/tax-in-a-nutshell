import { describe, expect, it } from 'vitest'
import { generateAccountsIxbrl } from './accountsIxbrl'
import type { CompanyDetails, AccountingPeriod, BalanceSheetFigures, ProfitAndLossFigures } from '../types'

const company: CompanyDetails = {
  companyName: 'Test Ltd', companyNumber: '12345678', utr: '1234567890', address: '1 Test St', postcode: 'AB1 2CD'
} as CompanyDetails
const period: AccountingPeriod = { periodStart: '2025-01-01', periodEnd: '2025-12-31' }
const balance: BalanceSheetFigures = {
  unpaidCapital: 0, fixedAssets: 1000, currentAssets: 2000, prepayments: 0,
  creditorsWithin: 500, creditorsAfter: 0, provisions: 0, shareCapital: 100, retained: 2400
}
const pnl: ProfitAndLossFigures = {
  turnover: 10_000, otherIncome: 0, rawMaterials: 1000, staffCosts: 2000, depreciation: 500, otherCharges: 200
}

describe('generateAccountsIxbrl', () => {
  it('omits comparative contexts and cells when no comparative is supplied', () => {
    const xml = generateAccountsIxbrl({ company, period, balance, pnl })
    expect(xml).not.toContain('ctx-bs-prior')
    expect(xml).not.toContain('ctx-pl-prior')
  })

  it('includes comparative contexts and facts when a comparative period is supplied', () => {
    const xml = generateAccountsIxbrl({
      company, period, balance, pnl,
      comparative: {
        period: { periodStart: '2024-01-01', periodEnd: '2024-12-31' },
        figures: { ...balance, ...pnl, fixedAssets: 900, turnover: 8_000 }
      }
    })
    expect(xml).toContain('id="ctx-bs-prior"')
    expect(xml).toContain('id="ctx-pl-prior"')
    expect(xml).toContain('2024-12-31')
    expect(xml).toContain('contextRef="ctx-bs-prior"')
  })
})
