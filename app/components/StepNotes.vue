<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f } = props.wizard
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Notes</h2>
  <p class="text-muted">FRS 105 requires a small number of notes alongside the accounts.</p>

  <div class="field">
    <label for="avgEmployees">Average number of employees during the period</label>
    <input id="avgEmployees" v-model="f.avgEmployees" class="input" inputmode="numeric" style="max-width:120px;">
  </div>
  <div class="field" style="margin-top: var(--space-3);">
    <label for="directorAdvances">Advances and credits to directors</label>
    <textarea id="directorAdvances" v-model="f.directorAdvances" class="input" placeholder="Enter details, or &quot;None&quot; if there were no director advances outstanding." />
  </div>
  <div class="field" style="margin-top: var(--space-3);">
    <label for="commitments">Off-balance-sheet commitments and guarantees</label>
    <textarea id="commitments" v-model="f.commitments" class="input" placeholder="Enter details, or leave blank if there are none." />
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
