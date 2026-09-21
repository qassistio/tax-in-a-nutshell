<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, pnl, taxableTotalProfits, corporationTax, capitalAllowances, lossRelief, directorLoanAssessment, totalTaxPayable } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Tax computation</h2>
  <p class="text-muted">Adjustments from accounting profit to taxable profit, and the Corporation Tax due.</p>

  <div class="amount-row">
    <label>Profit before tax (from the profit and loss account)</label>
    <span class="num">£{{ formatPounds(pnl.profitBeforeTax) }}</span>
  </div>
  <div class="amount-row">
    <label for="addDepreciation">Add back: depreciation</label>
    <input id="addDepreciation" v-model="f.addDepreciation" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="addEntertaining">Add back: client entertaining</label>
    <input id="addEntertaining" v-model="f.addEntertaining" class="input num" inputmode="decimal">
  </div>

  <h3>Capital allowances</h3>
  <p class="text-muted">Annual Investment Allowance then main-pool writing-down allowance, worked out from the pool totals rather than a per-asset register.</p>
  <div class="amount-row">
    <label for="caPoolBroughtForward">Main pool brought forward</label>
    <input id="caPoolBroughtForward" v-model="f.caPoolBroughtForward" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="caAdditions">Qualifying additions this period</label>
    <input id="caAdditions" v-model="f.caAdditions" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="caDisposals">Disposal proceeds this period</label>
    <input id="caDisposals" v-model="f.caDisposals" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label>Annual Investment Allowance claimed</label>
    <span class="num">£{{ formatPounds(capitalAllowances.aiaClaimed) }}</span>
  </div>
  <div class="amount-row">
    <label>Writing-down allowance claimed</label>
    <span class="num">£{{ formatPounds(capitalAllowances.wdaClaimed) }}</span>
  </div>
  <div class="amount-row is-total">
    <label>Total capital allowances</label>
    <span class="num">£{{ formatPounds(capitalAllowances.totalAllowances) }}</span>
  </div>
  <div class="amount-row">
    <label>Pool carried forward</label>
    <span class="num">£{{ formatPounds(capitalAllowances.poolCarriedForward) }}</span>
  </div>

  <h3 style="margin-top: var(--space-4);">Trading losses brought forward</h3>
  <div class="amount-row">
    <label for="lossesBroughtForward">Losses brought forward</label>
    <input id="lossesBroughtForward" v-model="f.lossesBroughtForward" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label>Relief used this period</label>
    <span class="num">£{{ formatPounds(lossRelief.reliefUsed) }}</span>
  </div>
  <div class="amount-row">
    <label>Losses carried forward</label>
    <span class="num">£{{ formatPounds(lossRelief.lossesCarriedForward) }}</span>
  </div>

  <div class="amount-row is-total" style="margin-top: var(--space-4);">
    <label>Taxable total profits</label>
    <span class="num">£{{ formatPounds(taxableTotalProfits) }}</span>
  </div>
  <div class="amount-row">
    <label for="associated">Associated companies (not counting this one)</label>
    <input id="associated" v-model="f.associated" class="input num" inputmode="numeric" style="max-width:80px;">
  </div>

  <div class="card elev-sm" style="margin-top: var(--space-4);">
    <template v-if="corporationTax.segments">
      <div class="card-kicker">Period spans a tax rate change</div>
      <div class="card-title">Corporation Tax due: £{{ formatPounds(corporationTax.corporationTax) }}</div>
      <p class="card-body">This period crosses 1 April into a year with a different tax rate, so profit is split between the two years below. Check these figures before filing.</p>
      <div v-for="seg in corporationTax.segments" :key="seg.fyStartYear" class="amount-row">
        <label>{{ seg.rates.version }} ({{ seg.days }} days) — £{{ formatPounds(seg.profit) }} of profit</label>
        <span class="num">£{{ formatPounds(seg.tax) }}</span>
      </div>
    </template>
    <template v-else>
      <div class="card-kicker">{{ corporationTax.rates.version }} rates</div>
      <div class="card-title">Corporation Tax due: £{{ formatPounds(corporationTax.corporationTax) }}</div>
      <p class="card-body">{{ corporationTax.rateNote }}</p>
    </template>
  </div>

  <h3 style="margin-top: var(--space-4);">Director's loan account</h3>
  <p class="text-muted">An overdrawn director's loan still outstanding at the period end may trigger a Section 455 charge and needs reporting on CT600A even if repaid.</p>
  <div class="amount-row">
    <label for="directorLoanBalance">Loan balance at period end</label>
    <input id="directorLoanBalance" v-model="f.directorLoanBalance" class="input num" inputmode="decimal">
  </div>
  <template v-if="Number(f.directorLoanBalance) > 0">
    <div class="amount-row">
      <label>Repaid before the Section 455 due date (9 months after the period end)?</label>
      <div class="seg">
        <label class="seg-opt"><input v-model="f.directorLoanRepaidBeforeDue" type="radio" value="no"><span>No</span></label>
        <label class="seg-opt"><input v-model="f.directorLoanRepaidBeforeDue" type="radio" value="yes"><span>Yes</span></label>
      </div>
    </div>
    <div class="card elev-sm" style="margin-top: var(--space-3);">
      <div class="card-title">
        {{ directorLoanAssessment.ct600aRequired ? 'CT600A required' : 'No CT600A needed' }}
        <template v-if="directorLoanAssessment.s455Due">— Section 455 due: £{{ formatPounds(directorLoanAssessment.s455Due) }}</template>
      </div>
      <p class="card-body">{{ directorLoanAssessment.explanation }}</p>
    </div>
  </template>

  <div class="card elev-sm" style="margin-top: var(--space-4);">
    <div class="card-title">Total tax payable: £{{ formatPounds(totalTaxPayable) }}</div>
    <p class="card-body">Corporation Tax plus any Section 455 charge on the director's loan account.</p>
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
