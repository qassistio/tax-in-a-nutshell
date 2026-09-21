<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, balance, comparativeBalance, comparativePeriod } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Balance sheet</h2>
  <p class="text-muted">FRS 105 micro-entity balance sheet, at the end of the accounting period.</p>

  <div style="display:flex; gap: var(--space-3); align-items:center; margin-bottom: var(--space-3);">
    <div class="seg">
      <label class="seg-opt"><input v-model="state.balanceEntryMode" type="radio" value="table"><span>Enter as a table</span></label>
      <label class="seg-opt"><input v-model="state.balanceEntryMode" type="radio" value="guided"><span>Guide me through it</span></label>
    </div>
    <button type="button" class="btn btn-ghost" @click="wizard.importOpenDialog()"><AppIcon name="upload" :size="16" />Import trial balance…</button>
  </div>

  <template v-if="state.balanceEntryMode === 'table'">
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
          <td><label for="unpaidCapital">Called up share capital not paid</label></td>
          <td><input id="unpaidCapital" v-model="f.unpaidCapital" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpUnpaidCapital" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="fixedAssets">Fixed assets</label></td>
          <td><input id="fixedAssets" v-model="f.fixedAssets" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpFixedAssets" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="currentAssets">Current assets</label></td>
          <td><input id="currentAssets" v-model="f.currentAssets" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpCurrentAssets" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="prepayments">Prepayments and accrued income</label></td>
          <td><input id="prepayments" v-model="f.prepayments" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpPrepayments" class="input num" inputmode="decimal"></td>
        </tr>
        <tr class="is-total">
          <td>Net current assets</td>
          <td class="num">£{{ formatPounds(balance.netCurrentAssets) }}</td>
          <td v-if="f.firstPeriod !== 'yes'" class="num">£{{ formatPounds(comparativeBalance.netCurrentAssets) }}</td>
        </tr>
        <tr>
          <td><label for="creditorsWithin">Creditors: due within one year</label></td>
          <td><input id="creditorsWithin" v-model="f.creditorsWithin" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpCreditorsWithin" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="creditorsAfter">Creditors: due after more than one year</label></td>
          <td><input id="creditorsAfter" v-model="f.creditorsAfter" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpCreditorsAfter" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="provisions">Provisions for liabilities</label></td>
          <td><input id="provisions" v-model="f.provisions" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpProvisions" class="input num" inputmode="decimal"></td>
        </tr>
        <tr class="is-total">
          <td>Net assets</td>
          <td class="num">£{{ formatPounds(balance.netAssets) }}</td>
          <td v-if="f.firstPeriod !== 'yes'" class="num">£{{ formatPounds(comparativeBalance.netAssets) }}</td>
        </tr>
        <tr>
          <td><label for="shareCapital">Called up share capital</label></td>
          <td><input id="shareCapital" v-model="f.shareCapital" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpShareCapital" class="input num" inputmode="decimal"></td>
        </tr>
        <tr>
          <td><label for="retained">Profit and loss account</label></td>
          <td><input id="retained" v-model="f.retained" class="input num" inputmode="decimal"></td>
          <td v-if="f.firstPeriod !== 'yes'"><input v-model="f.cmpRetained" class="input num" inputmode="decimal"></td>
        </tr>
        <tr class="is-total">
          <td>Total shareholders' funds</td>
          <td class="num">£{{ formatPounds(balance.totalShareholdersFunds) }}</td>
          <td v-if="f.firstPeriod !== 'yes'" class="num">£{{ formatPounds(comparativeBalance.totalShareholdersFunds) }}</td>
        </tr>
      </tbody>
    </table>

    <p style="margin-top: var(--space-3);">
      <span v-if="balance.balances" class="tag tag-accent">Balances</span>
      <span v-else class="tag tag-accent-2">Does not balance — off by £{{ formatPounds(Math.abs(balance.difference)) }}</span>
    </p>
  </template>

  <template v-else>
    <div class="guided-progress">Question {{ state.guidedIdx + 1 }} of {{ wizard.guidedTotal.value }}</div>
    <div class="card elev-sm">
      <span class="tag" :class="wizard.guidedField.value.isComparative ? 'tag-neutral' : 'tag-accent'" style="margin-bottom: var(--space-2);">
        {{ wizard.guidedField.value.isComparative
          ? `Prior year${comparativePeriod ? ' — ' + comparativePeriod.periodEnd.slice(0, 4) : ''}`
          : `This year${f.periodEnd ? ' — ' + f.periodEnd.slice(0, 4) : ''}` }}
      </span>
      <label :for="wizard.guidedField.value.key" class="card-title">{{ wizard.guidedField.value.label }}</label>
      <p class="card-body">{{ wizard.guidedField.value.help }}</p>
      <input :id="wizard.guidedField.value.key" v-model="f[wizard.guidedField.value.key]" class="input num" inputmode="decimal" style="max-width:220px;">
    </div>
    <div style="display:flex; gap: var(--space-2); margin-top: var(--space-3);">
      <button type="button" class="btn btn-secondary" :disabled="state.guidedIdx === 0" @click="wizard.guidedBack()">Previous</button>
      <button
        v-if="state.guidedIdx < wizard.guidedTotal.value - 1"
        type="button" class="btn btn-primary" @click="wizard.guidedNext()"
      >
        Next
      </button>
      <button v-else type="button" class="btn btn-primary" @click="state.balanceEntryMode = 'table'">Review as table</button>
    </div>
  </template>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
