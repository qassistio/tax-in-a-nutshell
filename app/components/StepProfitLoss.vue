<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, pnl, comparativePnl, comparativePeriod } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Profit and loss</h2>
  <p class="text-muted">FRS 105 permits an abridged profit and loss account — these are the figures it needs.</p>

  <table class="table amount-table">
    <thead>
      <tr>
        <th>Line item</th>
        <th>{{ f.periodEnd ? f.periodEnd.slice(0, 4) : 'This year' }}</th>
        <th v-if="f.firstPeriod !== 'yes'">{{ comparativePeriod ? comparativePeriod.periodEnd.slice(0, 4) : 'Prior year' }}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><label for="turnover">Turnover</label></td>
        <td><input id="turnover" v-model="f.turnover" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpTurnover" class="input num" inputmode="decimal"></td>
      </tr>
      <tr>
        <td><label for="otherIncome">Other income</label></td>
        <td><input id="otherIncome" v-model="f.otherIncome" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpOtherIncome" class="input num" inputmode="decimal"></td>
      </tr>
      <tr>
        <td><label for="rawMaterials">Cost of raw materials and consumables</label></td>
        <td><input id="rawMaterials" v-model="f.rawMaterials" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpRawMaterials" class="input num" inputmode="decimal"></td>
      </tr>
      <tr>
        <td><label for="staffCosts">Staff costs</label></td>
        <td><input id="staffCosts" v-model="f.staffCosts" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpStaffCosts" class="input num" inputmode="decimal"></td>
      </tr>
      <tr>
        <td><label for="depreciation">Depreciation and other amounts written off assets</label></td>
        <td><input id="depreciation" v-model="f.depreciation" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpDepreciation" class="input num" inputmode="decimal"></td>
      </tr>
      <tr>
        <td><label for="otherCharges">Other charges</label></td>
        <td><input id="otherCharges" v-model="f.otherCharges" class="input num" inputmode="decimal"></td>
        <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpOtherCharges" class="input num" inputmode="decimal"></td>
      </tr>
      <tr class="is-total">
        <td>Profit or loss before tax</td>
        <td class="num">£{{ formatPounds(pnl.profitBeforeTax) }}</td>
        <td v-if="f.firstPeriod !== 'yes'" class="num">£{{ formatPounds(comparativePnl.profitBeforeTax) }}</td>
      </tr>
    </tbody>
  </table>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
