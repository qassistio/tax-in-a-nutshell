import type { FilingProblem } from '../types'
import type { BalanceSheetTotals } from '../accounting/totals'
import { formatPounds } from '../accounting/totals'

export interface ProblemInputs {
  balance: BalanceSheetTotals
  utr: string
  avgEmployees: string
  directorAdvances: string
  turnover: number
  addBackDepreciation: number
  accountsDepreciation: number
  microEntityTurnoverLimit: number
  directorLoanBalance: number
  directorLoanRepaidAnswered: boolean
}

/** The eligibility/validation engine requirements.md §21 asks for, scoped
 *  to what this wizard currently collects. Each problem names the step
 *  that fixes it, so the review screen can link straight there. */
export function findProblems(inputs: ProblemInputs): FilingProblem[] {
  const problems: FilingProblem[] = []

  if (!inputs.balance.balances) {
    problems.push({
      id: 'balance-sheet-unbalanced',
      sev: 'error',
      step: 'balance',
      title: 'The balance sheet does not balance',
      detail: `Net assets £${formatPounds(inputs.balance.netAssets)} against shareholders' funds £${formatPounds(inputs.balance.totalShareholdersFunds)}. Difference of £${formatPounds(Math.abs(inputs.balance.difference))}.`
    })
  }

  if (!/^\d{10}$/.test(inputs.utr.replace(/\s/g, ''))) {
    problems.push({
      id: 'utr-invalid',
      sev: 'error',
      step: 'company',
      title: 'Unique Taxpayer Reference is not ten digits',
      detail: 'HMRC will reject the submission before it reaches the gateway.'
    })
  }

  if (!inputs.avgEmployees.trim()) {
    problems.push({
      id: 'employees-missing',
      sev: 'error',
      step: 'notes',
      title: 'Average number of employees is missing',
      detail: 'FRS 105 requires this note even where the figure is one.'
    })
  }

  if (!inputs.directorAdvances.trim()) {
    problems.push({
      id: 'director-advances-blank',
      sev: 'warn',
      step: 'notes',
      title: 'Directors’ advances note left blank',
      detail: 'Required if any director’s loan was outstanding during the period. Enter "None" to confirm there were none.'
    })
  }

  if (inputs.turnover > inputs.microEntityTurnoverLimit) {
    problems.push({
      id: 'turnover-over-threshold',
      sev: 'error',
      step: 'pnl',
      title: 'Turnover exceeds the micro-entity threshold',
      detail: `Above £${inputs.microEntityTurnoverLimit.toLocaleString('en-GB')} the company must file small or full accounts instead.`
    })
  }

  if (inputs.addBackDepreciation !== inputs.accountsDepreciation) {
    problems.push({
      id: 'depreciation-mismatch',
      sev: 'warn',
      step: 'tax',
      title: 'Depreciation added back does not match the accounts',
      detail: `The profit and loss account shows £${formatPounds(inputs.accountsDepreciation)}; the computation adds back £${formatPounds(inputs.addBackDepreciation)}.`
    })
  }

  if (inputs.directorLoanBalance > 0 && !inputs.directorLoanRepaidAnswered) {
    problems.push({
      id: 'director-loan-repaid-unanswered',
      sev: 'error',
      step: 'tax',
      title: 'Director loan repayment status not answered',
      detail: 'There is an outstanding director loan balance — say whether it was repaid before the Section 455 due date so CT600A can be completed correctly.'
    })
  }

  return problems
}

/** requirements.md §2 — the current micro-entity turnover threshold. */
export const MICRO_ENTITY_TURNOVER_LIMIT = 632_000
export const MICRO_ENTITY_BALANCE_SHEET_LIMIT = 316_000
export const MICRO_ENTITY_EMPLOYEE_LIMIT = 10

/** Every monetary line on the balance sheet, profit and loss account and
 *  tax computation. A blank box is never treated as £0 — nil is a figure
 *  the preparer has to enter deliberately, same as on the real forms,
 *  so a line left blank is an error rather than a silent assumption.
 *
 *  Prior-year comparative figures (requirements.md §11) sit alongside
 *  their current-year counterpart — same `step` as the line they compare
 *  against, since both columns are entered on the same balance
 *  sheet/P&L screen (an accountant expects a two-column table, not a
 *  separate screen) — flagged `comparative: true` so
 *  findMissingAmountFields can skip them for a first accounting period,
 *  which has nothing to compare to. */
export const REQUIRED_AMOUNT_FIELDS: Array<{ key: string; label: string; step: string; comparative?: boolean }> = [
  { key: 'unpaidCapital', label: 'Called up share capital not paid', step: 'balance' },
  { key: 'fixedAssets', label: 'Fixed assets', step: 'balance' },
  { key: 'currentAssets', label: 'Current assets', step: 'balance' },
  { key: 'prepayments', label: 'Prepayments and accrued income', step: 'balance' },
  { key: 'creditorsWithin', label: 'Creditors: amounts falling due within one year', step: 'balance' },
  { key: 'creditorsAfter', label: 'Creditors: amounts falling due after more than one year', step: 'balance' },
  { key: 'provisions', label: 'Provisions for liabilities', step: 'balance' },
  { key: 'shareCapital', label: 'Called up share capital', step: 'balance' },
  { key: 'retained', label: 'Profit and loss account / retained earnings', step: 'balance' },
  { key: 'turnover', label: 'Turnover', step: 'pnl' },
  { key: 'otherIncome', label: 'Other income', step: 'pnl' },
  { key: 'rawMaterials', label: 'Cost of raw materials and consumables', step: 'pnl' },
  { key: 'staffCosts', label: 'Staff costs', step: 'pnl' },
  { key: 'depreciation', label: 'Depreciation and other amounts written off assets', step: 'pnl' },
  { key: 'otherCharges', label: 'Other charges', step: 'pnl' },
  { key: 'addDepreciation', label: 'Add back: depreciation', step: 'tax' },
  { key: 'addEntertaining', label: 'Add back: client entertaining', step: 'tax' },
  { key: 'caPoolBroughtForward', label: 'Capital allowances pool brought forward', step: 'tax' },
  { key: 'caAdditions', label: 'Capital allowances: qualifying additions', step: 'tax' },
  { key: 'caDisposals', label: 'Capital allowances: disposal proceeds', step: 'tax' },
  { key: 'lossesBroughtForward', label: 'Trading losses brought forward', step: 'tax' },
  { key: 'directorLoanBalance', label: 'Director loan account balance at period end', step: 'tax' },
  { key: 'cmpUnpaidCapital', label: 'Prior year: called up share capital not paid', step: 'balance', comparative: true },
  { key: 'cmpFixedAssets', label: 'Prior year: fixed assets', step: 'balance', comparative: true },
  { key: 'cmpCurrentAssets', label: 'Prior year: current assets', step: 'balance', comparative: true },
  { key: 'cmpPrepayments', label: 'Prior year: prepayments and accrued income', step: 'balance', comparative: true },
  { key: 'cmpCreditorsWithin', label: 'Prior year: creditors due within one year', step: 'balance', comparative: true },
  { key: 'cmpCreditorsAfter', label: 'Prior year: creditors due after more than one year', step: 'balance', comparative: true },
  { key: 'cmpProvisions', label: 'Prior year: provisions for liabilities', step: 'balance', comparative: true },
  { key: 'cmpShareCapital', label: 'Prior year: called up share capital', step: 'balance', comparative: true },
  { key: 'cmpRetained', label: 'Prior year: profit and loss account', step: 'balance', comparative: true },
  { key: 'cmpTurnover', label: 'Prior year: turnover', step: 'pnl', comparative: true },
  { key: 'cmpOtherIncome', label: 'Prior year: other income', step: 'pnl', comparative: true },
  { key: 'cmpRawMaterials', label: 'Prior year: cost of raw materials and consumables', step: 'pnl', comparative: true },
  { key: 'cmpStaffCosts', label: 'Prior year: staff costs', step: 'pnl', comparative: true },
  { key: 'cmpDepreciation', label: 'Prior year: depreciation and other amounts written off assets', step: 'pnl', comparative: true },
  { key: 'cmpOtherCharges', label: 'Prior year: other charges', step: 'pnl', comparative: true }
]

/** Flags every required amount field left blank. Zero is a perfectly
 *  valid answer — it just has to be typed, not inferred.
 *  `includeComparatives` should be false for a first accounting period —
 *  see the REQUIRED_AMOUNT_FIELDS comment above. */
export function findMissingAmountFields(fields: Record<string, string | undefined>, applicableSteps: Set<string>, includeComparatives = true): FilingProblem[] {
  return REQUIRED_AMOUNT_FIELDS
    .filter(f => applicableSteps.has(f.step) && (!f.comparative || includeComparatives) && !String(fields[f.key] ?? '').trim())
    .map(f => ({
      id: `missing-amount-${f.key}`,
      sev: 'error' as const,
      step: f.step,
      title: `${f.label} is blank`,
      detail: 'Enter a figure, including 0 where the amount is genuinely nil — blank boxes are never assumed to be zero.'
    }))
}
