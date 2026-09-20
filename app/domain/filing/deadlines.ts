// Deadline calculation (requirements.md §27). Handles the ordinary case;
// long/short periods and changed accounting reference dates are noted as
// follow-up work rather than silently mishandled.

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export interface FilingDeadlines {
  periodLengthDays: number | null
  companiesHouseDue: Date | null
  corporationTaxPaymentDue: Date | null
  ct600Due: Date | null
}

export function calculateDeadlines(periodStart: string, periodEnd: string): FilingDeadlines {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { periodLengthDays: null, companiesHouseDue: null, corporationTaxPaymentDue: null, ct600Due: null }
  }
  const periodLengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return {
    periodLengthDays,
    // Private companies: 9 months after the accounting reference period end.
    companiesHouseDue: addMonths(end, 9),
    // Corporation Tax is due 9 months and 1 day after the end of the period.
    corporationTaxPaymentDue: addDays(addMonths(end, 9), 1),
    // The Company Tax Return itself is due 12 months after the period end.
    ct600Due: addMonths(end, 12)
  }
}
