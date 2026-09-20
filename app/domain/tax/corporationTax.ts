// Corporation Tax calculation. Rules are versioned by effective date
// (requirements.md §13, §33/§42) — nothing here reads "the current rate";
// callers ask `ratesFor(anAccountingPeriodEndDate)`.

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

/** Corporation Tax rates have applied unchanged, at these thresholds,
 *  since 1 April 2023. Add earlier entries here as they become relevant
 *  rather than special-casing dates throughout the app. */
export function ratesFor(_periodEndDate: string | Date): CorporationTaxRates {
  return FY2024_RATES
}

export interface CorporationTaxResult {
  taxableTotalProfits: number
  corporationTax: number
  effectiveRate: number
  rateNote: string
  rates: CorporationTaxRates
}

/** Associated companies divide the small-profits and main-rate limits
 *  between them in equal shares (requirements.md §13). */
export function calculateCorporationTax(
  taxableTotalProfits: number,
  associatedCompanies: number,
  rates: CorporationTaxRates
): CorporationTaxResult {
  const shares = Math.max(0, associatedCompanies) + 1
  const lower = rates.lowerLimit / shares
  const upper = rates.upperLimit / shares

  let tax: number
  let rateNote: string

  if (taxableTotalProfits <= 0) {
    tax = 0
    rateNote = 'No taxable profit in the period.'
  } else if (taxableTotalProfits <= lower) {
    tax = taxableTotalProfits * rates.smallProfitsRate
    rateNote = `Small profits rate, ${rates.smallProfitsRate * 100}%. Taxable profits are below the £${Math.round(lower).toLocaleString('en-GB')} lower limit.`
  } else if (taxableTotalProfits >= upper) {
    tax = taxableTotalProfits * rates.mainRate
    rateNote = `Main rate, ${rates.mainRate * 100}%.`
  } else {
    tax = taxableTotalProfits * rates.mainRate - rates.marginalReliefFraction * (upper - taxableTotalProfits)
    rateNote = `Main rate ${rates.mainRate * 100}% with marginal relief.`
  }

  const corporationTax = Math.floor(tax)
  return {
    taxableTotalProfits,
    corporationTax,
    effectiveRate: taxableTotalProfits > 0 ? corporationTax / taxableTotalProfits : 0,
    rateNote,
    rates
  }
}
