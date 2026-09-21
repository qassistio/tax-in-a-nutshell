<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { formatPounds } from '../domain/accounting/totals'
import type { StepId } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, balance, pnl, corporationTax, problems, STEP_LABELS, figureTrail } = props.wizard

function goTo(step: string) {
  props.wizard.go(step as StepId)
}
</script>

<template>
  <div class="step-kicker">Step {{ props.wizard.currentIndex.value + 1 }}</div>
  <h2>Review</h2>
  <p class="text-muted">Check the figures below, and clear anything flagged before you declare and submit.</p>

  <template v-if="problems.length">
    <h4>To fix before you can submit</h4>
    <div class="problem-list">
      <button
        v-for="p in problems" :key="p.id" type="button"
        class="problem" :class="p.sev === 'error' ? 'problem-error' : 'problem-warn'"
        @click="goTo(p.step)"
      >
        <span>
          <span class="tag" :class="p.sev === 'error' ? 'tag-accent-2' : 'tag-neutral'">{{ p.sev === 'error' ? 'Fix' : 'Check' }}</span>
          <span class="problem-title">{{ p.title }}</span><br>
          <span class="problem-detail">{{ p.detail }} — {{ STEP_LABELS[p.step as keyof typeof STEP_LABELS] }}</span>
        </span>
      </button>
    </div>
  </template>
  <p v-else class="tag tag-accent">No outstanding problems</p>

  <h4 style="margin-top: var(--space-6);">Company</h4>
  <p>{{ f.companyName }} · {{ f.companyNumber }} · UTR {{ f.utr }}</p>

  <h4>Balance sheet</h4>
  <p>
    Net assets £{{ formatPounds(balance.netAssets) }} · Shareholders' funds £{{ formatPounds(balance.totalShareholdersFunds) }}
    · <span v-if="balance.balances" class="tag tag-accent">Balances</span><span v-else class="tag tag-accent-2">Does not balance</span>
  </p>

  <h4>Profit and loss</h4>
  <p>Turnover £{{ formatPounds(wizard.f.turnover ? Number(wizard.f.turnover) : 0) }} · Profit before tax £{{ formatPounds(pnl.profitBeforeTax) }}</p>

  <template v-if="props.wizard.state.filings.ct600">
    <h4>Corporation Tax</h4>
    <p>Taxable total profits £{{ formatPounds(corporationTax.taxableTotalProfits) }} · Tax due £{{ formatPounds(corporationTax.corporationTax) }} ({{ corporationTax.rates.version }})</p>

    <h4>Where the taxable profit figure comes from</h4>
    <ol class="audit-trail">
      <li v-for="step in figureTrail" :key="step.label">
        <strong>{{ step.label }}</strong>
        <span v-if="step.amount !== undefined"> — £{{ formatPounds(step.amount) }}</span>
        <br><span class="text-muted" style="font-size: 13px;">{{ step.detail }}</span>
      </li>
    </ol>
  </template>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)">Back</button>
    <button type="button" class="btn btn-primary" :disabled="problems.some(p => p.sev === 'error')" @click="wizard.move(1)">Continue to declaration</button>
  </div>
</template>
