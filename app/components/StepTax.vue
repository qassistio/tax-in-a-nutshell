<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, pnl, taxableTotalProfits, corporationTax } = props.wizard
</script>

<template>
  <div class="step-kicker">Step 6</div>
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
  <div class="amount-row">
    <label for="capAllowances">Less: capital allowances</label>
    <input id="capAllowances" v-model="f.capAllowances" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row is-total">
    <label>Taxable total profits</label>
    <span class="num">£{{ formatPounds(taxableTotalProfits) }}</span>
  </div>
  <div class="amount-row">
    <label for="associated">Associated companies (not counting this one)</label>
    <input id="associated" v-model="f.associated" class="input num" inputmode="numeric" style="max-width:80px;">
  </div>

  <div class="card elev-sm" style="margin-top: var(--space-4);">
    <div class="card-kicker">{{ corporationTax.rates.version }} rates</div>
    <div class="card-title">Corporation Tax due: £{{ formatPounds(corporationTax.corporationTax) }}</div>
    <p class="card-body">{{ corporationTax.rateNote }}</p>
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)">Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue</button>
  </div>
</template>
