// requirements.md §32 — Audit Trail. Kept as an in-memory session log
// (never persisted — consistent with "nothing stored until you submit");
// its purpose is to make every figure traceable back to where it came
// from while the session is open, and to be exportable in the receipt.

export type AuditCategory =
  | 'import' | 'mapping' | 'adjustment' | 'override'
  | 'tax-rule' | 'document' | 'validation' | 'approval' | 'submission' | 'amendment'

export interface AuditEntry {
  id: string
  at: string
  category: AuditCategory
  message: string
}

let counter = 0
export function createAuditEntry(category: AuditCategory, message: string): AuditEntry {
  counter += 1
  return { id: `a${counter}`, at: new Date().toISOString(), category, message }
}

export interface FigureTrailStep {
  label: string
  detail: string
  amount?: number
}

/** Reconstructs the worked example from requirements.md §32: taxable
 *  profit traced back through the tax computation adjustments to
 *  accounting profit, and (when a trial balance was imported) on to the
 *  original ledger accounts. */
export function buildTaxableProfitTrail(input: {
  taxableTotalProfits: number
  profitBeforeTax: number
  addDepreciation: number
  addEntertaining: number
  capAllowances: number
  importedFrom?: { fileName: string; rowCount: number }
}): FigureTrailStep[] {
  const steps: FigureTrailStep[] = [
    { label: 'CT600 taxable total profits', detail: 'Carried to the Company Tax Return', amount: input.taxableTotalProfits },
    { label: 'Tax computation', detail: 'Accounting profit adjusted for tax purposes' },
    { label: 'Accounting profit before tax', detail: 'From the profit and loss account', amount: input.profitBeforeTax },
    { label: '+ Depreciation added back', detail: 'Not an allowable deduction for Corporation Tax', amount: input.addDepreciation },
    { label: '+ Client entertaining added back', detail: 'Not an allowable deduction for Corporation Tax', amount: input.addEntertaining },
    { label: '− Capital allowances', detail: 'Allowable in place of depreciation', amount: -input.capAllowances }
  ]
  if (input.importedFrom) {
    steps.push({
      label: 'Trial balance',
      detail: `Imported from ${input.importedFrom.fileName} (${input.importedFrom.rowCount} ledger accounts)`
    })
  }
  return steps
}
