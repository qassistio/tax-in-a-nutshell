<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, deadlines } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Accounting period</h2>
  <p class="text-muted">The period these accounts and return cover.</p>

  <div class="field-grid">
    <div class="field">
      <label for="periodStart">Period start</label>
      <input id="periodStart" v-model="f.periodStart" type="date" class="input">
    </div>
    <div class="field">
      <label for="periodEnd">Period end</label>
      <input id="periodEnd" v-model="f.periodEnd" type="date" class="input">
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
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
