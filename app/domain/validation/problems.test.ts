import { describe, expect, it } from 'vitest'
import { findMissingAmountFields, findProblems, MICRO_ENTITY_TURNOVER_LIMIT, type ProblemInputs } from './problems'
import { balanceSheetTotals } from '../accounting/totals'

const balancedInputs = (): ProblemInputs => ({
  balance: balanceSheetTotals({
    unpaidCapital: 0,
    fixedAssets: 0,
    currentAssets: 0,
    prepayments: 0,
    creditorsWithin: 0,
    creditorsAfter: 0,
    provisions: 0,
    shareCapital: 0,
    retained: 0
  }),
  utr: '1234567890',
  avgEmployees: '2',
  directorAdvances: 'None',
  turnover: 100_000,
  addBackDepreciation: 500,
  accountsDepreciation: 500,
  microEntityTurnoverLimit: MICRO_ENTITY_TURNOVER_LIMIT,
  directorLoanBalance: 0,
  directorLoanRepaidAnswered: false
})

describe('findProblems', () => {
  it('reports no problems when everything is valid', () => {
    expect(findProblems(balancedInputs())).toEqual([])
  })

  it('flags an unbalanced balance sheet as an error', () => {
    const inputs = balancedInputs()
    inputs.balance = balanceSheetTotals({
      unpaidCapital: 0, fixedAssets: 100, currentAssets: 0, prepayments: 0,
      creditorsWithin: 0, creditorsAfter: 0, provisions: 0, shareCapital: 0, retained: 0
    })
    const problems = findProblems(inputs)
    expect(problems.find(p => p.id === 'balance-sheet-unbalanced')).toMatchObject({ sev: 'error', step: 'balance' })
  })

  it('flags a UTR that is not ten digits', () => {
    const problems = findProblems({ ...balancedInputs(), utr: '12345' })
    expect(problems.find(p => p.id === 'utr-invalid')).toMatchObject({ sev: 'error', step: 'company' })
  })

  it('flags a blank average employees field', () => {
    const problems = findProblems({ ...balancedInputs(), avgEmployees: '  ' })
    expect(problems.find(p => p.id === 'employees-missing')).toMatchObject({ sev: 'error', step: 'notes' })
  })

  it('warns, but does not error, on a blank director advances note', () => {
    const problems = findProblems({ ...balancedInputs(), directorAdvances: '' })
    expect(problems.find(p => p.id === 'director-advances-blank')).toMatchObject({ sev: 'warn', step: 'notes' })
  })

  it('flags turnover above the micro-entity threshold', () => {
    const problems = findProblems({ ...balancedInputs(), turnover: MICRO_ENTITY_TURNOVER_LIMIT + 1 })
    expect(problems.find(p => p.id === 'turnover-over-threshold')).toMatchObject({ sev: 'error', step: 'pnl' })
  })

  it('warns when the depreciation add-back does not match the accounts', () => {
    const problems = findProblems({ ...balancedInputs(), addBackDepreciation: 600, accountsDepreciation: 500 })
    expect(problems.find(p => p.id === 'depreciation-mismatch')).toMatchObject({ sev: 'warn', step: 'tax' })
  })

  it('flags an outstanding director loan whose repayment status is unanswered', () => {
    const problems = findProblems({ ...balancedInputs(), directorLoanBalance: 5_000, directorLoanRepaidAnswered: false })
    expect(problems.find(p => p.id === 'director-loan-repaid-unanswered')).toMatchObject({ sev: 'error', step: 'tax' })
  })

  it('does not flag a director loan once its repayment status is answered', () => {
    const problems = findProblems({ ...balancedInputs(), directorLoanBalance: 5_000, directorLoanRepaidAnswered: true })
    expect(problems.find(p => p.id === 'director-loan-repaid-unanswered')).toBeUndefined()
  })
})

describe('findMissingAmountFields', () => {
  it('flags every required field left blank for applicable steps', () => {
    const problems = findMissingAmountFields({ turnover: '', otherIncome: '100' }, new Set(['pnl']))
    expect(problems.map(p => p.id)).toContain('missing-amount-turnover')
    expect(problems.map(p => p.id)).not.toContain('missing-amount-otherIncome')
  })

  it('treats an explicit 0 as answered, not missing', () => {
    const problems = findMissingAmountFields({ turnover: '0' }, new Set(['pnl']))
    expect(problems.map(p => p.id)).not.toContain('missing-amount-turnover')
  })

  it('ignores fields outside the applicable steps', () => {
    // turnover belongs to the 'pnl' step, so it should never be flagged when only 'tax' is applicable.
    const problems = findMissingAmountFields({ turnover: '' }, new Set(['tax']))
    expect(problems.map(p => p.id)).not.toContain('missing-amount-turnover')
  })
})
