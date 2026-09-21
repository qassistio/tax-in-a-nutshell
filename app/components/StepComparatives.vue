<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, comparativePeriod } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Prior year comparatives</h2>
  <p class="text-muted">
    FRS 105 accounts show a comparative column alongside this year's figures. Enter last year's balance
    sheet and profit and loss totals
    <template v-if="comparativePeriod">(the period ended {{ comparativePeriod.periodEnd }})</template>.
  </p>

  <h3>Balance sheet</h3>
  <div class="amount-row">
    <label for="cmpUnpaidCapital">Called up share capital not paid</label>
    <input id="cmpUnpaidCapital" v-model="f.cmpUnpaidCapital" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpFixedAssets">Fixed assets</label>
    <input id="cmpFixedAssets" v-model="f.cmpFixedAssets" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpCurrentAssets">Current assets</label>
    <input id="cmpCurrentAssets" v-model="f.cmpCurrentAssets" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpPrepayments">Prepayments and accrued income</label>
    <input id="cmpPrepayments" v-model="f.cmpPrepayments" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpCreditorsWithin">Creditors: due within one year</label>
    <input id="cmpCreditorsWithin" v-model="f.cmpCreditorsWithin" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpCreditorsAfter">Creditors: due after more than one year</label>
    <input id="cmpCreditorsAfter" v-model="f.cmpCreditorsAfter" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpProvisions">Provisions for liabilities</label>
    <input id="cmpProvisions" v-model="f.cmpProvisions" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpShareCapital">Called up share capital</label>
    <input id="cmpShareCapital" v-model="f.cmpShareCapital" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpRetained">Profit and loss account</label>
    <input id="cmpRetained" v-model="f.cmpRetained" class="input num" inputmode="decimal">
  </div>

  <h3 style="margin-top: var(--space-4);">Profit and loss account</h3>
  <div class="amount-row">
    <label for="cmpTurnover">Turnover</label>
    <input id="cmpTurnover" v-model="f.cmpTurnover" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpOtherIncome">Other income</label>
    <input id="cmpOtherIncome" v-model="f.cmpOtherIncome" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpRawMaterials">Cost of raw materials and consumables</label>
    <input id="cmpRawMaterials" v-model="f.cmpRawMaterials" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpStaffCosts">Staff costs</label>
    <input id="cmpStaffCosts" v-model="f.cmpStaffCosts" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpDepreciation">Depreciation and other amounts written off assets</label>
    <input id="cmpDepreciation" v-model="f.cmpDepreciation" class="input num" inputmode="decimal">
  </div>
  <div class="amount-row">
    <label for="cmpOtherCharges">Other charges</label>
    <input id="cmpOtherCharges" v-model="f.cmpOtherCharges" class="input num" inputmode="decimal">
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
