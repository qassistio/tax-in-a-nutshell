<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, pnl } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Profit and loss</h2>
  <p class="text-muted">FRS 105 permits an abridged profit and loss account — these are the figures it needs.</p>

  <div class="amount-row">
    <label for="turnover">Turnover</label>
    <input id="turnover" v-model="f.turnover" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="otherIncome">Other income</label>
    <input id="otherIncome" v-model="f.otherIncome" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="rawMaterials">Cost of raw materials and consumables</label>
    <input id="rawMaterials" v-model="f.rawMaterials" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="staffCosts">Staff costs</label>
    <input id="staffCosts" v-model="f.staffCosts" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="depreciation">Depreciation and other amounts written off assets</label>
    <input id="depreciation" v-model="f.depreciation" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="otherCharges">Other charges</label>
    <input id="otherCharges" v-model="f.otherCharges" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row is-total">
    <label>Profit or loss before tax</label>
    <span class="num">£{{ formatPounds(pnl.profitBeforeTax) }}</span>
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
