// Prior-year comparatives (requirements.md §11) — every FRS 105 balance
// sheet and profit and loss account shows a comparative column, so this
// isn't optional scope, just kept light: one more set of the same
// balance-sheet/P&L fields for last year, no import or previous-filing
// reuse machinery. First-period companies have nothing to compare to, so
// the comparative step is skipped entirely for them.

export interface ComparativePeriod {
  periodStart: string
  periodEnd: string
}

/** The prior accounting period immediately before the current one:
 *  ordinary case only (a 12-month period ending the day before this
 *  period started) — long/short prior periods aren't derived, they're
 *  just dates the filer can override if needed by leaving comparatives
 *  blank and noting it elsewhere. */
export function previousPeriodFor(periodStart: string): ComparativePeriod | null {
  const start = new Date(periodStart)
  if (Number.isNaN(start.getTime())) return null

  const end = new Date(start)
  end.setDate(end.getDate() - 1)

  const priorStart = new Date(end)
  priorStart.setFullYear(priorStart.getFullYear() - 1)
  priorStart.setDate(priorStart.getDate() + 1)

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { periodStart: iso(priorStart), periodEnd: iso(end) }
}
