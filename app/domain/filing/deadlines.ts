// Deadline calculation (requirements.md §27). Handles the ordinary case
// plus the first-accounts Companies House rule and a >12-month period's
// split CT600 deadlines. Changed accounting reference dates are still
// unhandled — this product has no concept of a previous filing to compare against.

import { splitLongAccountingPeriod } from '../tax/longPeriodSplit'

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

export interface CtPeriodDeadlines {
  periodStart: string
  periodEnd: string
  corporationTaxPaymentDue: Date
  ct600Due: Date
}

export interface FilingDeadlines {
  periodLengthDays: number | null
  companiesHouseDue: Date | null
  corporationTaxPaymentDue: Date | null
  ct600Due: Date | null
  /** Present only when the accounting period exceeds 12 months — the
   *  second CT600 period's own deadlines (requirements.md §11). Filing is
   *  blocked in this case (see problems.ts), but the deadlines are still
   *  shown so the filer can see what's involved. */
  secondCorporationTaxPeriod?: CtPeriodDeadlines
}

/** `opts.firstPeriod`/`opts.incorporationDate` apply the first-accounts
 *  Companies House deadline: the later of 21 months after incorporation,
 *  or 3 months after the period end, instead of the usual 9 months after
 *  the period end. Falls back to the usual rule when no incorporation
 *  date is given. */
export function calculateDeadlines(
  periodStart: string,
  periodEnd: string,
  opts: { firstPeriod?: boolean; incorporationDate?: string } = {}
): FilingDeadlines {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { periodLengthDays: null, companiesHouseDue: null, corporationTaxPaymentDue: null, ct600Due: null }
  }
  const periodLengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1

  // Private companies: ordinarily 9 months after the accounting reference
  // period end, but a company's first accounts are due the later of 21
  // months after incorporation or 3 months after the period end instead.
  let companiesHouseDue = addMonths(end, 9)
  if (opts.firstPeriod && opts.incorporationDate) {
    const incorporated = new Date(opts.incorporationDate)
    if (!Number.isNaN(incorporated.getTime())) {
      const twentyOneMonths = addMonths(incorporated, 21)
      const threeMonths = addMonths(end, 3)
      companiesHouseDue = twentyOneMonths > threeMonths ? twentyOneMonths : threeMonths
    }
  }

  // A period over 12 months needs two CT accounting periods (requirements.md
  // §11), each with its own Corporation Tax payment and CT600 due date.
  const ctPeriods = splitLongAccountingPeriod(periodStart, periodEnd)
  const first = ctPeriods[0]!
  const firstPeriodEnd = new Date(first.periodEnd)
  const result: FilingDeadlines = {
    periodLengthDays,
    companiesHouseDue,
    corporationTaxPaymentDue: addDays(addMonths(firstPeriodEnd, 9), 1),
    ct600Due: addMonths(firstPeriodEnd, 12)
  }

  const second = ctPeriods[1]
  if (second) {
    const secondPeriodEnd = new Date(second.periodEnd)
    result.secondCorporationTaxPeriod = {
      periodStart: second.periodStart,
      periodEnd: second.periodEnd,
      corporationTaxPaymentDue: addDays(addMonths(secondPeriodEnd, 9), 1),
      ct600Due: addMonths(secondPeriodEnd, 12)
    }
  }

  return result
}
