// Minimal trial balance -> canonical account mapping (requirements.md §6).
// Keyword classification is a reasonable first pass for an MVP; it is
// explicitly a suggestion, not a silent decision — every row is shown to
// the user with what it was mapped to before anything is applied.

export type CanonicalAccount =
  | 'fixedAssets' | 'currentAssets' | 'prepayments'
  | 'creditorsWithin' | 'creditorsAfter' | 'provisions'
  | 'shareCapital' | 'retained'
  | 'turnover' | 'otherIncome' | 'rawMaterials' | 'staffCosts' | 'depreciation' | 'otherCharges'
  | null

export interface TrialBalanceRow {
  code: string
  name: string
  debit: number
  credit: number
  /** debit - credit for asset/expense accounts, credit - debit for
   *  liability/income/equity accounts — the sign the balance sheet and
   *  profit and loss figures expect. */
  amount: number
  mapsTo: CanonicalAccount
}

// Liability, income and equity accounts run credit-positive; everything
// else (assets, expenses) runs debit-positive.
const CREDIT_POSITIVE = new Set<CanonicalAccount>([
  'creditorsWithin', 'creditorsAfter', 'provisions', 'shareCapital', 'retained', 'turnover', 'otherIncome'
])

const RULES: Array<{ test: RegExp; account: CanonicalAccount }> = [
  { test: /depreciation/i, account: 'depreciation' },
  { test: /prepay/i, account: 'prepayments' },
  { test: /(equipment|plant|machinery|fixture|vehicle|computer|furniture|leasehold improve)/i, account: 'fixedAssets' },
  { test: /(debtor|receivable|bank|cash|stock|inventory)/i, account: 'currentAssets' },
  { test: /long.?term loan|loan.*(over|after).*(one )?year/i, account: 'creditorsAfter' },
  { test: /(creditor|payable|vat|paye|accrual|loan)/i, account: 'creditorsWithin' },
  { test: /provision/i, account: 'provisions' },
  { test: /share capital/i, account: 'shareCapital' },
  { test: /(retained|profit and loss account|reserves)/i, account: 'retained' },
  { test: /(sales|turnover|revenue|consultancy|service income)/i, account: 'turnover' },
  { test: /interest income|other income/i, account: 'otherIncome' },
  { test: /(cost of sales|materials|subcontractor|purchases)/i, account: 'rawMaterials' },
  { test: /(salar|wage|payroll|pension|employer.?s ni|staff cost)/i, account: 'staffCosts' },
  {
    test: /(rent|rates|insurance|software|hosting|telephone|internet|travel|motor|advertis|entertain|bank charge|professional fee|accountancy|legal|repair|subscription|utilit)/i,
    account: 'otherCharges'
  }
]

export function classifyAccountName(name: string): CanonicalAccount {
  for (const rule of RULES) {
    if (rule.test.test(name)) return rule.account
  }
  return null
}

/** Parses a simple CSV export (account code, account name, debit, credit,
 *  in any column order recognised by header name) into trial balance rows,
 *  classified against the canonical model. Never touches the server —
 *  the file is read and parsed entirely in the browser. */
export function parseTrialBalanceCsv(csvText: string): TrialBalanceRow[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const splitRow = (line: string) => line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
  const header = splitRow(lines[0]!).map(h => h.toLowerCase())

  const findCol = (...names: string[]) => header.findIndex(h => names.some(n => h.includes(n)))
  const codeCol = findCol('code', 'account code', 'nominal')
  const nameCol = findCol('name', 'account', 'description')
  const debitCol = findCol('debit', 'dr')
  const creditCol = findCol('credit', 'cr')
  const amountCol = findCol('amount', 'balance')

  const toNumber = (raw: string | undefined) => {
    if (!raw) return 0
    const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
    return Number.isNaN(n) ? 0 : n
  }

  const rows: TrialBalanceRow[] = []
  for (const line of lines.slice(1)) {
    const cols = splitRow(line)
    const name = nameCol >= 0 ? cols[nameCol] ?? '' : ''
    if (!name) continue
    const code = codeCol >= 0 ? cols[codeCol] ?? '' : ''
    let debit = toNumber(debitCol >= 0 ? cols[debitCol] : undefined)
    let credit = toNumber(creditCol >= 0 ? cols[creditCol] : undefined)
    if (!debit && !credit && amountCol >= 0) {
      const n = toNumber(cols[amountCol])
      if (n >= 0) debit = n
      else credit = -n
    }
    const mapsTo = classifyAccountName(name)
    const amount = mapsTo && CREDIT_POSITIVE.has(mapsTo) ? credit - debit : debit - credit
    rows.push({ code, name, debit, credit, amount, mapsTo })
  }
  return rows
}

/** Sums classified rows into the canonical fields they map to. Unmatched
 *  rows are returned separately so the UI can flag them rather than lose
 *  them silently. */
export function summariseTrialBalance(rows: TrialBalanceRow[]) {
  const totals: Partial<Record<Exclude<CanonicalAccount, null>, number>> = {}
  const unmatched: TrialBalanceRow[] = []
  for (const row of rows) {
    if (!row.mapsTo) {
      unmatched.push(row)
      continue
    }
    totals[row.mapsTo] = (totals[row.mapsTo] ?? 0) + row.amount
  }
  return { totals, unmatched }
}
