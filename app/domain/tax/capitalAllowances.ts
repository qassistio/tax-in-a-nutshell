// Capital allowances (requirements.md §12/§9/§40), kept aggregate rather
// than an asset-by-asset register: filer supplies total additions/
// disposals plus main pool brought forward; AIA then main-pool WDA is
// applied. Special-rate-pool assets, cars, or complex pooling history are
// out of scope (requirements.md §2).
//
// Rates are versioned by effective date, same pattern as corporationTax.ts.

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

/** AIA first (100% up to the limit), then WDA on what's left in the pool
 *  after AIA and disposals. A balancing charge (proceeds exceeding the
 *  pool) is left at £0 allowance rather than a taxable credit — rare
 *  enough for a company this size to flag for manual review instead. */
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
