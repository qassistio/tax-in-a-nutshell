<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { ELIGIBILITY_CHECKS, type EligibilityAnswers } from '../domain/eligibility/eligibility'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f } = props.wizard

const FIELD_BY_KEY: Record<keyof EligibilityAnswers, 'eligAudited' | 'eligGroup' | 'eligOverseas' | 'eligSpecialistRelief'> = {
  audited: 'eligAudited', group: 'eligGroup', overseas: 'eligOverseas', specialistRelief: 'eligSpecialistRelief'
}
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Eligibility</h2>
  <p class="text-muted">A few quick questions to check this company is in scope — unaudited, standalone,
    UK-only micro-entity accounts and a standard CT600. Answering "yes" to any of these means an accountant
    or specialist software is needed instead.</p>

  <div v-for="check in ELIGIBILITY_CHECKS" :key="check.id" class="card elev-sm" style="margin-bottom: var(--space-3);">
    <label class="card-title">{{ check.question }}</label>
    <div class="seg" style="margin-top: var(--space-2); align-self: flex-start;">
      <label class="seg-opt"><input v-model="f[FIELD_BY_KEY[check.answerKey]]" type="radio" value="no"><span>No</span></label>
      <label class="seg-opt"><input v-model="f[FIELD_BY_KEY[check.answerKey]]" type="radio" value="yes"><span>Yes</span></label>
    </div>
    <p v-if="f[FIELD_BY_KEY[check.answerKey]] === 'yes'" class="card-body" style="color: var(--color-accent-2);">
      {{ check.title }} — {{ check.detail }}
    </p>
  </div>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
