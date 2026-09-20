// Shared domain types. Kept independent of Vue: the UI orchestrates the
// filing process, but none of the accounting or tax rules live in a
// component — see requirements.md §38.

export interface CompanyDetails {
  companyName: string
  companyNumber: string
  utr: string
  address: string
  postcode: string
  sic: string
}

export interface AccountingPeriod {
  periodStart: string
  periodEnd: string
  firstPeriod: boolean
}

/** FRS 105 balance sheet, current-year figures only — prior year is a
 *  separate snapshot (`comparatives`) rather than mixed into the same record. */
export interface BalanceSheetFigures {
  unpaidCapital: number
  fixedAssets: number
  currentAssets: number
  prepayments: number
  creditorsWithin: number
  creditorsAfter: number
  provisions: number
  shareCapital: number
  retained: number
}

export interface ProfitAndLossFigures {
  turnover: number
  otherIncome: number
  rawMaterials: number
  staffCosts: number
  depreciation: number
  otherCharges: number
}

export interface TaxAdjustments {
  addDepreciation: number
  addEntertaining: number
  capAllowances: number
  associatedCompanies: number
}

export interface NotesAndApproval {
  avgEmployees: string
  directorAdvances: string
  commitments: string
  approver: string
  approvalDate: string
}

export interface Declaration {
  declName: string
  declRole: string
  agreed: boolean
}

export type ProblemSeverity = 'error' | 'warn'

export interface FilingProblem {
  id: string
  sev: ProblemSeverity
  step: string
  title: string
  detail: string
}

export interface FilingSelection {
  accounts: boolean
  ct600: boolean
  companiesHouse: boolean
}
