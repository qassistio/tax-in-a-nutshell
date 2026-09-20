<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, balance } = props.wizard
</script>

<template>
  <div class="step-kicker">Step 4</div>
  <h2>Balance sheet</h2>
  <p class="text-muted">FRS 105 micro-entity balance sheet, at the end of the accounting period.</p>

  <div style="display:flex; gap: var(--space-3); align-items:center; margin-bottom: var(--space-3);">
    <div class="seg">
      <label class="seg-opt"><input v-model="state.balanceEntryMode" type="radio" value="table"><span>Enter as a table</span></label>
      <label class="seg-opt"><input v-model="state.balanceEntryMode" type="radio" value="guided"><span>Guide me through it</span></label>
    </div>
    <button type="button" class="btn btn-ghost" @click="wizard.importOpenDialog()">Import trial balance…</button>
  </div>

  <template v-if="state.balanceEntryMode === 'table'">
    <div class="amount-row">
      <label for="unpaidCapital">Called up share capital not paid</label>
      <input id="unpaidCapital" v-model="f.unpaidCapital" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="fixedAssets">Fixed assets</label>
      <input id="fixedAssets" v-model="f.fixedAssets" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="currentAssets">Current assets</label>
      <input id="currentAssets" v-model="f.currentAssets" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="prepayments">Prepayments and accrued income</label>
      <input id="prepayments" v-model="f.prepayments" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row is-total">
      <label>Net current assets</label>
      <span class="num">£{{ formatPounds(balance.netCurrentAssets) }}</span>
    </div>
    <div class="amount-row">
      <label for="creditorsWithin">Creditors: due within one year</label>
      <input id="creditorsWithin" v-model="f.creditorsWithin" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="creditorsAfter">Creditors: due after more than one year</label>
      <input id="creditorsAfter" v-model="f.creditorsAfter" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="provisions">Provisions for liabilities</label>
      <input id="provisions" v-model="f.provisions" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row is-total">
      <label>Net assets</label>
      <span class="num">£{{ formatPounds(balance.netAssets) }}</span>
    </div>
    <div class="amount-row">
      <label for="shareCapital">Called up share capital</label>
      <input id="shareCapital" v-model="f.shareCapital" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row">
      <label for="retained">Profit and loss account</label>
      <input id="retained" v-model="f.retained" class="input num" inputmode="decimal">
    </div>
    <div class="amount-row is-total">
      <label>Total shareholders' funds</label>
      <span class="num">£{{ formatPounds(balance.totalShareholdersFunds) }}</span>
    </div>

    <p style="margin-top: var(--space-3);">
      <span v-if="balance.balances" class="tag tag-accent">Balances</span>
      <span v-else class="tag tag-accent-2">Does not balance — off by £{{ formatPounds(Math.abs(balance.difference)) }}</span>
    </p>
  </template>

  <template v-else>
    <div class="guided-progress">Question {{ state.guidedIdx + 1 }} of {{ wizard.guidedTotal }}</div>
    <div class="card elev-sm">
      <label :for="wizard.guidedField.value.key" class="card-title">{{ wizard.guidedField.value.label }}</label>
      <p class="card-body">{{ wizard.guidedField.value.help }}</p>
      <input :id="wizard.guidedField.value.key" v-model="f[wizard.guidedField.value.key]" class="input num" inputmode="decimal" style="max-width:220px;">
    </div>
    <div style="display:flex; gap: var(--space-2); margin-top: var(--space-3);">
      <button type="button" class="btn btn-secondary" :disabled="state.guidedIdx === 0" @click="wizard.guidedBack()">Previous</button>
      <button
        v-if="state.guidedIdx < wizard.guidedTotal - 1"
        type="button" class="btn btn-primary" @click="wizard.guidedNext()"
      >
        Next
      </button>
      <button v-else type="button" class="btn btn-primary" @click="state.balanceEntryMode = 'table'">Review as table</button>
    </div>
  </template>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)">Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue</button>
  </div>
</template>
