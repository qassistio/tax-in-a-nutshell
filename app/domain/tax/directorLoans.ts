// Director loan accounts / Section 455 / CT600A (requirements.md §15/§17)
// — kept to a single aggregate loan balance at the period end rather than
// tracking individual advances and repayments through the year: the
// filer supplies the outstanding balance and whether (and when) it was
// repaid, and this works out whether a s.455 charge and a CT600A are
// required. Multiple loan accounts, write-offs and bed-and-breakfasting
// rules are out of scope (requirements.md §2).

export interface DirectorLoanInput {
  /** Loan account balance outstanding at the accounting period end. £0 if
   *  there was no overdrawn loan. */
  balanceAtPeriodEnd: number
  /** Whether the whole balance was repaid before the s.455 due date
   *  (nine months and one day after the period end). */
  repaidBeforeDue: boolean
}

export interface DirectorLoanRates {
  version: string
  /** Section 455 rate — matches the dividend upper rate, currently 33.75%. */
  s455Rate: number
}

const FY2024_S455_RATES: DirectorLoanRates = { version: 'FY2024', s455Rate: 0.3375 }

/** In effect since 6 April 2022. Add earlier entries here as needed. */
export function directorLoanRatesFor(_periodEndDate: string | Date): DirectorLoanRates {
  return FY2024_S455_RATES
}

export interface DirectorLoanResult {
  ct600aRequired: boolean
  s455Due: number
  explanation: string
}

export function assessDirectorLoan(input: DirectorLoanInput, rates: DirectorLoanRates): DirectorLoanResult {
  if (input.balanceAtPeriodEnd <= 0) {
    return { ct600aRequired: false, s455Due: 0, explanation: 'No overdrawn director loan balance at the period end.' }
  }

  if (input.repaidBeforeDue) {
    return {
      ct600aRequired: true,
      s455Due: 0,
      explanation: 'The loan was fully repaid before the Section 455 due date, so no additional tax is charged — but CT600A is still required to report it.'
    }
  }

  const s455Due = Math.round(input.balanceAtPeriodEnd * rates.s455Rate)
  return {
    ct600aRequired: true,
    s455Due,
    explanation: `The loan was not repaid within nine months of the period end, so a Section 455 charge of ${(rates.s455Rate * 100).toFixed(2)}% of the outstanding balance is due alongside the Corporation Tax. This is repayable once the loan itself is repaid.`
  }
}
