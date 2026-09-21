// requirements.md §11 — a statutory accounting period can run longer than
// 12 months, but a Corporation Tax accounting period never can (CTA 2009
// s.9/s.10): a period over 12 months splits into a first CT accounting
// period of exactly 12 months, then a second, shorter one for the
// remainder — each needing its own CT600 return.
//
// This product doesn't submit two separate CT600s, so `findProblems`
// blocks filing when a period needs this split (see problems.ts). This
// module still computes the correct split so the filer can see it.

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface Ct600Period {
  sequence: 1 | 2
  periodStart: string
  periodEnd: string
  days: number
}

/** Splits an accounting period longer than 12 months into two CT
 *  accounting periods: the first covering exactly 12 months from the
 *  start, the second the remainder. Returns a single one-element array,
 *  unchanged, for a period of 12 months or less. */
export function splitLongAccountingPeriod(periodStart: string, periodEnd: string): Ct600Period[] {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [{ sequence: 1, periodStart, periodEnd, days: 0 }]
  }
  // Exactly 12 months from the start, minus a day (e.g. 1 Jan 2025 -> 31 Dec 2025).
  const firstApEnd = addDays(new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate())), -1)

  if (firstApEnd >= end) {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    return [{ sequence: 1, periodStart, periodEnd, days }]
  }

  const days1 = Math.round((firstApEnd.getTime() - start.getTime()) / 86_400_000) + 1
  const secondStart = addDays(firstApEnd, 1)
  const days2 = Math.round((end.getTime() - secondStart.getTime()) / 86_400_000) + 1
  return [
    { sequence: 1, periodStart, periodEnd: toIso(firstApEnd), days: days1 },
    { sequence: 2, periodStart: toIso(secondStart), periodEnd, days: days2 }
  ]
}

/** True when the accounting period exceeds 12 months and needs splitting
 *  into two CT accounting periods/returns. */
export function isLongAccountingPeriod(periodStart: string, periodEnd: string): boolean {
  return splitLongAccountingPeriod(periodStart, periodEnd).length > 1
}

/** Splits a single whole-period total (e.g. turnover) across the CT
 *  periods returned by `splitLongAccountingPeriod`, by day count. */
export function apportionAcrossCt600Periods(total: number, periods: Ct600Period[]): number[] {
  const totalDays = periods.reduce((sum, p) => sum + p.days, 0)
  return periods.map(p => total * p.days / totalDays)
}
