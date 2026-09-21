<script setup lang="ts">
import { computed } from 'vue'
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, deadlines } = props.wizard

// The wizard/domain layer (deadlines, comparatives, tax rates, iXBRL
// contexts) all work in exact ISO dates (f.periodStart/f.periodEnd stay
// 'YYYY-MM-DD' everywhere else), but filers shouldn't have to pick an
// exact day for an accounting reference date — almost every company's
// period runs month-start to month-end. So the inputs here are plain
// HTML `type="month"` pickers ('YYYY-MM'), and these computed get/set
// pairs translate that to the first/last calendar day of the chosen
// month behind the scenes.
const periodStartMonth = computed({
  get: () => f.periodStart.slice(0, 7),
  set: (month: string) => { f.periodStart = month ? `${month}-01` : '' }
})
const periodEndMonth = computed({
  get: () => f.periodEnd.slice(0, 7),
  set: (month: string) => { f.periodEnd = month ? lastDayOfMonth(month) : '' }
})

function lastDayOfMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  // Day 0 of the *next* month is the last day of this one.
  const last = new Date(Date.UTC(year!, mon!, 0))
  return last.toISOString().slice(0, 10)
}
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Accounting period</h2>
  <p class="text-muted">The period these accounts and return cover.</p>

  <div class="field-grid">
    <div class="field">
      <label for="periodStart">Period start</label>
      <input id="periodStart" v-model="periodStartMonth" type="month" class="input">
    </div>
    <div class="field">
      <label for="periodEnd">Period end</label>
      <input id="periodEnd" v-model="periodEndMonth" type="month" class="input">
    </div>
  </div>

  <div class="field" style="margin-top: var(--space-3);">
    <label>Is this the company's first accounting period?</label>
    <div class="seg">
      <label class="seg-opt"><input v-model="f.firstPeriod" type="radio" value="yes"><span>Yes</span></label>
      <label class="seg-opt"><input v-model="f.firstPeriod" type="radio" value="no"><span>No</span></label>
    </div>
  </div>

  <div v-if="deadlines.periodLengthDays" class="card" style="margin-top: var(--space-4);">
    <div class="card-kicker">Deadlines</div>
    <p class="card-body">
      Period length: {{ deadlines.periodLengthDays }} days.<br>
      Companies House accounts due: <strong>{{ deadlines.companiesHouseDue?.toLocaleDateString('en-GB') }}</strong><br>
      Corporation Tax payment due: <strong>{{ deadlines.corporationTaxPaymentDue?.toLocaleDateString('en-GB') }}</strong><br>
      Company Tax Return (CT600) due: <strong>{{ deadlines.ct600Due?.toLocaleDateString('en-GB') }}</strong>
    </p>
    <p v-if="deadlines.secondCorporationTaxPeriod" class="card-body" style="color: var(--color-accent-2);">
      This period is longer than 12 months, so HMRC needs two separate Corporation Tax returns for it.
      This tool doesn't support that — see the tax step for details.
    </p>
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
