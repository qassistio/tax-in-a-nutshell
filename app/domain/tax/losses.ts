// Trading losses carry-forward (requirements.md §14/§40) — kept to the
// common owner-managed case: a single brought-forward loss balance offset
// against the current period's trading result. Carry-back, group relief
// and terminal-loss relief are explicitly out of scope (requirements.md §2).

export interface LossReliefInput {
  /** Trading profit for the period after capital allowances, before loss
   *  relief — may be negative (a current-period loss). */
  tradingResult: number
  lossesBroughtForward: number
}

export interface LossReliefResult {
  /** Brought-forward losses actually used against this period's profit. */
  reliefUsed: number
  /** Trading result after relief — never negative; a loss can only reduce
   *  the tax bill to nil, not create a repayment on its own. */
  taxableAfterLosses: number
  /** Carried forward to next period: unused brought-forward losses, plus
   *  any new loss arising this period. */
  lossesCarriedForward: number
}

export function applyLossRelief(input: LossReliefInput): LossReliefResult {
  const broughtForward = Math.max(0, input.lossesBroughtForward)

  if (input.tradingResult <= 0) {
    // A loss-making period: nothing to relieve against, and the period's
    // own loss joins what's already carried forward.
    return {
      reliefUsed: 0,
      taxableAfterLosses: 0,
      lossesCarriedForward: broughtForward + Math.abs(input.tradingResult)
    }
  }

  const reliefUsed = Math.min(broughtForward, input.tradingResult)
  return {
    reliefUsed,
    taxableAfterLosses: input.tradingResult - reliefUsed,
    lossesCarriedForward: broughtForward - reliefUsed
  }
}
