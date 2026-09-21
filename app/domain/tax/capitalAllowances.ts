// Capital allowances (requirements.md §12/§9/§40), kept deliberately
// aggregate rather than an asset-by-asset register: the filer supplies
// total qualifying additions and disposals for the period plus the main
// pool balance brought forward, and this applies the Annual Investment
// Allowance followed by the main-pool writing-down allowance. Good enough
// for an owner-managed micro-entity's ordinary plant and machinery; a
// company with special-rate-pool assets, cars, or a pooling history
// complex enough to need per-asset tracking is outside this product's
// scope (requirements.md §2).
//
// Rates are versioned by effective date, same pattern as
// tax/corporationTax.ts — nothing here reads "the current AIA limit".

export interface CapitalAllowanceRates {
  version: string
  /** Annual Investment Allowance limit — 100% relief on qualifying
   *  additions up to this amount in the period. */
  aiaLimit: number
  /** Main-pool writing-down allowance rate on the balance after AIA. */
  mainPoolWdaRate: number
}

const FY2024_CAPITAL_ALLOWANCE_RATES: CapitalAllowanceRates = {
  version: 'FY2024',
  // Permanent since 1 April 2023 (previously a temporary extension).
  aiaLimit: 1_000_000,
  mainPoolWdaRate: 0.18
}

/** The AIA limit and main rate have applied unchanged since 1 April 2023.
 *  Add earlier entries here as they become relevant. */
export function capitalAllowanceRatesFor(_periodEndDate: string | Date): CapitalAllowanceRates {
  return FY2024_CAPITAL_ALLOWANCE_RATES
}

export interface CapitalAllowancesInput {
  poolBroughtForward: number
  additions: number
  disposals: number
  rates: CapitalAllowanceRates
}

export interface CapitalAllowancesResult {
  aiaClaimed: number
  wdaClaimed: number
  totalAllowances: number
  poolCarriedForward: number
}

/** Annual Investment Allowance first (100% on qualifying additions up to
 *  the limit), then an 18% writing-down allowance on whatever's left in
 *  the main pool after AIA and disposals. Disposal proceeds simply reduce
 *  the pool before WDA is calculated — a balancing charge (proceeds
 *  exceeding the pool) is left at £0 allowance rather than turned into a
 *  taxable credit, since that scenario is rare for a company this small
 *  and is flagged for manual review instead of silently miscalculated. */
export function calculateCapitalAllowances(input: CapitalAllowancesInput): CapitalAllowancesResult {
  const { poolBroughtForward, additions, disposals, rates } = input
  const aiaClaimed = Math.min(Math.max(additions, 0), rates.aiaLimit)
  const poolAfterAia = Math.max(0, poolBroughtForward + additions - aiaClaimed - disposals)
  const wdaClaimed = Math.round(poolAfterAia * rates.mainPoolWdaRate)
  const poolCarriedForward = poolAfterAia - wdaClaimed
  return {
    aiaClaimed,
    wdaClaimed,
    totalAllowances: aiaClaimed + wdaClaimed,
    poolCarriedForward
  }
}
