// Corporation Tax calculation. Rules are versioned by effective date
// (requirements.md §13, §33/§42) — nothing here reads "the current rate";
// callers ask `ratesFor(anAccountingPeriodEndDate)`.

import type { AccountingPeriod } from '../types'

export interface CorporationTaxRates {
  /** Label shown in the computation, e.g. "FY2024". */
  version: string
  smallProfitsRate: number
  mainRate: number
  /** Taxable-profit threshold below which the small profits rate applies (pre-association). */
  lowerLimit: number
  /** Taxable-profit threshold above which the main rate applies with no relief (pre-association). */
  upperLimit: number
  /** Standard marginal relief fraction. */
  marginalReliefFraction: number
}

const FY2024_RATES: CorporationTaxRates = {
  version: 'FY2024',
  smallProfitsRate: 0.19,
  mainRate: 0.25,
  lowerLimit: 50_000,
  upperLimit: 250_000,
  marginalReliefFraction: 3 / 200
}

/** One entry per rate change, keyed by the Financial Year (named by the
 *  calendar year it starts — 1 April – 31 March) it first took effect in.
 *  `ratesForFinancialYear` picks the latest entry at or before the FY asked
 *  for. Add new entries here as rates change, rather than special-casing
 *  dates elsewhere. */
const RATES_HISTORY: Array<{ effectiveFromFyStartYear: number; rates: CorporationTaxRates }> = [
  { effectiveFromFyStartYear: 2023, rates: FY2024_RATES }
]

function ratesForFinancialYear(fyStartYear: number): CorporationTaxRates {
  const applicable = [...RATES_HISTORY].reverse().find(v => fyStartYear >= v.effectiveFromFyStartYear)
  return (applicable ?? RATES_HISTORY[0]).rates
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** The Financial Year a date falls in, named by the calendar year it
 *  starts (1 April – 31 March) — e.g. 15 Feb 2025 is in FY2024. */
function financialYearStartYearFor(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getUTCFullYear()
  return d.getUTCMonth() >= 3 ? year : year - 1
}

export interface FinancialYearSegment {
  fyStartYear: number
  from: string
  to: string
  days: number
}

/** Splits an accounting period into one segment per Financial Year it
 *  touches, at each 1 April boundary. UK accounting periods can't exceed
 *  12 months, so this returns at most two segments in practice, but makes
 *  no assumption of that here. */
export function splitPeriodByFinancialYear(periodStart: string, periodEnd: string): FinancialYearSegment[] {
  const end = new Date(periodEnd)
  const segments: FinancialYearSegment[] = []
  let segStart = new Date(periodStart)
  while (segStart <= end) {
    const fyStartYear = financialYearStartYearFor(segStart)
    const fyEnd = new Date(Date.UTC(fyStartYear + 1, 2, 31))
    const segEnd = fyEnd < end ? fyEnd : end
    const days = Math.round((segEnd.getTime() - segStart.getTime()) / 86_400_000) + 1
    segments.push({ fyStartYear, from: segStart.toISOString().slice(0, 10), to: segEnd.toISOString().slice(0, 10), days })
    segStart = new Date(segEnd.getTime() + 86_400_000)
  }
  return segments
}

/** Corporation Tax rates have applied unchanged, at these thresholds,
 *  since 1 April 2023 — see RATES_HISTORY above for how this looks up
 *  by the date's Financial Year. */
export function ratesFor(periodEndDate: string | Date): CorporationTaxRates {
  return ratesForFinancialYear(financialYearStartYearFor(periodEndDate))
}

export interface FinancialYearSegmentResult {
  fyStartYear: number
  from: string
  to: string
  days: number
  /** This segment's time-apportioned share of the period's taxable total profits. */
  profit: number
  /** This segment's unrounded Corporation Tax charge — only the combined
   *  total (`CorporationTaxResult.corporationTax`) is rounded, at the end. */
  tax: number
  rates: CorporationTaxRates
  rateNote: string
}

export interface CorporationTaxResult {
  taxableTotalProfits: number
  corporationTax: number
  effectiveRate: number
  rateNote: string
  rates: CorporationTaxRates
  /** Present only when the accounting period straddles 1 April and the
   *  Financial Years either side have different rates (requirements.md §13)
   *  — see `calculateCorporationTaxForPeriod`. Absent for the ordinary
   *  single-rate case, which is every real case until rates next change. */
  segments?: FinancialYearSegmentResult[]
}

function computeTax(taxableTotalProfits: number, lower: number, upper: number, rates: CorporationTaxRates): { tax: number; rateNote: string } {
  if (taxableTotalProfits <= 0) {
    return { tax: 0, rateNote: 'No taxable profit in the period.' }
  } else if (taxableTotalProfits <= lower) {
    return {
      tax: taxableTotalProfits * rates.smallProfitsRate,
      rateNote: `Small profits rate, ${rates.smallProfitsRate * 100}%. Taxable profits are below the £${Math.round(lower).toLocaleString('en-GB')} lower limit.`
    }
  } else if (taxableTotalProfits >= upper) {
    return { tax: taxableTotalProfits * rates.mainRate, rateNote: `Main rate, ${rates.mainRate * 100}%.` }
  } else {
    return {
      tax: taxableTotalProfits * rates.mainRate - rates.marginalReliefFraction * (upper - taxableTotalProfits),
      rateNote: `Main rate ${rates.mainRate * 100}% with marginal relief.`
    }
  }
}

/** Associated companies divide the small-profits and main-rate limits
 *  between them in equal shares (requirements.md §13). Single-Financial-Year
 *  primitive — for a whole accounting period, which may straddle 1 April,
 *  see `calculateCorporationTaxForPeriod`. */
export function calculateCorporationTax(
  taxableTotalProfits: number,
  associatedCompanies: number,
  rates: CorporationTaxRates
): CorporationTaxResult {
  const shares = Math.max(0, associatedCompanies) + 1
  const lower = rates.lowerLimit / shares
  const upper = rates.upperLimit / shares
  const { tax, rateNote } = computeTax(taxableTotalProfits, lower, upper, rates)
  const corporationTax = Math.floor(tax)
  return {
    taxableTotalProfits,
    corporationTax,
    effectiveRate: taxableTotalProfits > 0 ? corporationTax / taxableTotalProfits : 0,
    rateNote,
    rates
  }
}

/** True when the accounting period straddles 1 April into a Financial Year
 *  with different rates (CTA 2009 s.8(5)) — i.e. when
 *  `calculateCorporationTaxForPeriod` apportions instead of using its
 *  single-rate fast path. Used by `findProblems` to flag the period for review. */
export function periodSpansDifferingFinancialYearRates(periodStart: string, periodEnd: string): boolean {
  const rateSets = splitPeriodByFinancialYear(periodStart, periodEnd).map(seg => ratesForFinancialYear(seg.fyStartYear))
  return rateSets.length > 1 && !rateSets.every(r => r === rateSets[0])
}

/** Whole-accounting-period Corporation Tax, handling a period that
 *  straddles 1 April (requirements.md §13). When the period falls entirely
 *  within one Financial Year — or spans two Financial Years with identical
 *  rates — this is equivalent to `calculateCorporationTax` and `segments`
 *  is left undefined. Otherwise, per CTA 2009 s.8(5), taxable total profits
 *  are apportioned between the Financial Years by day count, and each part
 *  is taxed as its own accounting period before the results are summed. */
export function calculateCorporationTaxForPeriod(
  taxableTotalProfits: number,
  associatedCompanies: number,
  period: Pick<AccountingPeriod, 'periodStart' | 'periodEnd'>
): CorporationTaxResult {
  const segments = splitPeriodByFinancialYear(period.periodStart, period.periodEnd)
    .map(seg => ({ ...seg, rates: ratesForFinancialYear(seg.fyStartYear) }))

  if (segments.every(s => s.rates === segments[0].rates)) {
    return calculateCorporationTax(taxableTotalProfits, associatedCompanies, segments[0].rates)
  }

  return apportionAcrossFinancialYears(taxableTotalProfits, associatedCompanies, segments)
}

/** The day-based apportionment (CTA 2009 s.8(5)), split out from
 *  `calculateCorporationTaxForPeriod` so it can be tested directly against
 *  fabricated Financial Year rates. */
export function apportionAcrossFinancialYears(
  taxableTotalProfits: number,
  associatedCompanies: number,
  segments: Array<Pick<FinancialYearSegment, 'fyStartYear' | 'days'> & { rates: CorporationTaxRates; from?: string; to?: string }>
): CorporationTaxResult {
  const shares = Math.max(0, associatedCompanies) + 1
  const totalDays = segments.reduce((sum, seg) => sum + seg.days, 0)

  const segmentResults: FinancialYearSegmentResult[] = segments.map(seg => {
    const profit = taxableTotalProfits * seg.days / totalDays
    const daysInFy = isLeapYear(seg.fyStartYear + 1) ? 366 : 365
    const lower = (seg.rates.lowerLimit * seg.days / daysInFy) / shares
    const upper = (seg.rates.upperLimit * seg.days / daysInFy) / shares
    const { tax, rateNote } = computeTax(profit, lower, upper, seg.rates)
    return { fyStartYear: seg.fyStartYear, from: seg.from ?? '', to: seg.to ?? '', days: seg.days, profit, tax, rates: seg.rates, rateNote }
  })

  const corporationTax = Math.floor(segmentResults.reduce((sum, s) => sum + s.tax, 0))
  const rateNote = segmentResults
    .map(s => `${s.rates.version} (${s.days} days): ${s.rateNote}`)
    .join(' ')

  return {
    taxableTotalProfits,
    corporationTax,
    effectiveRate: taxableTotalProfits > 0 ? corporationTax / taxableTotalProfits : 0,
    rateNote,
    // Single-`rates` consumers see the later Financial Year's rates.
    rates: segmentResults[segmentResults.length - 1].rates,
    segments: segmentResults
  }
}
