<script setup lang="ts">
import { onMounted, watch, type Component } from 'vue'
import { useFilingWizard } from './composables/useFilingWizard'
import type { StepId } from './composables/useFilingWizard'
import StepStart from './components/StepStart.vue'
import StepEligibility from './components/StepEligibility.vue'
import StepCompany from './components/StepCompany.vue'
import StepPeriod from './components/StepPeriod.vue'
import StepBalance from './components/StepBalance.vue'
import StepProfitLoss from './components/StepProfitLoss.vue'
import StepCompaniesHouse from './components/StepCompaniesHouse.vue'
import StepTax from './components/StepTax.vue'
import StepNotes from './components/StepNotes.vue'
import StepReview from './components/StepReview.vue'
import StepDeclaration from './components/StepDeclaration.vue'
import StepReceipt from './components/StepReceipt.vue'
import ImportTrialBalanceDialog from './components/ImportTrialBalanceDialog.vue'
import StepProblems from './components/StepProblems.vue'

// Review already lists every outstanding problem itself (with "jump to
// step" links), and start/receipt never have any — so StepProblems only
// renders in between, right above whichever step is current.
const STEPS_WITHOUT_INLINE_PROBLEMS = new Set<StepId>(['start', 'review', 'receipt'])

const wizard = useFilingWizard()
const { state, order, STEP_LABELS } = wizard

// Resolved directly to component definitions — Nuxt's auto-imported
// components aren't globally registered, so a plain name string passed to
// <component :is="..."> can't be resolved at runtime.
const stepComponents: Record<StepId, Component> = {
  start: StepStart,
  eligibility: StepEligibility,
  company: StepCompany,
  period: StepPeriod,
  balance: StepBalance,
  pnl: StepProfitLoss,
  chSubmit: StepCompaniesHouse,
  tax: StepTax,
  notes: StepNotes,
  review: StepReview,
  declaration: StepDeclaration,
  receipt: StepReceipt
}

// Reloading the page (or opening a link someone was sent) restores the
// submission status screen from the GUID in the URL — see
// server/utils/db.ts for what's actually stored against that id (status
// metadata only, never the accounting figures).
onMounted(async () => {
  const id = new URLSearchParams(window.location.search).get('submission')
  if (id) {
    await wizard.refreshSubmissionStatus(id)
    wizard.go('receipt')
  }
})

watch(() => state.submissionId, (id) => {
  if (!id) return
  const url = new URL(window.location.href)
  url.searchParams.set('submission', id)
  window.history.replaceState({}, '', url)
})
</script>

<template>
  <header class="masthead">
    <div class="masthead-row">
      <div class="masthead-title">
        <img class="masthead-logo" src="/assets/icons/favicon.svg" alt="" width="32" height="32">
        <h1>TaxInANutshell</h1>
      </div>
      <a class="masthead-byline" href="https://qassist.io" target="_blank" rel="noopener noreferrer">A QAssist product</a>
    </div>
    <div class="masthead-rule" />
    <p class="masthead-tagline">
      File your Company Tax Return and micro-entity accounts straight to HMRC and Companies House — free, no
      accountant or filing software to buy, done in your browser in one sitting.
    </p>
  </header>

  <div class="wizard">
    <nav class="wizard-nav" aria-label="Filing steps">
      <button
        v-for="step in order"
        :key="step"
        type="button"
        class="wizard-nav-item"
        :class="{ 'is-current': step === state.step, 'is-locked': !wizard.isStepUnlocked(step) }"
        :disabled="!wizard.isStepUnlocked(step)"
        :aria-disabled="!wizard.isStepUnlocked(step)"
        @click="wizard.go(step)"
      >
        <span
          class="wizard-nav-mark"
          :class="{
            'is-done': wizard.stepStatus(step) === 'done',
            'is-error': wizard.stepStatus(step) === 'error',
            'is-warn': wizard.stepStatus(step) === 'warn'
          }"
        >
          <AppIcon v-if="wizard.stepStatus(step) === 'done'" name="check" :size="12" weight="fill" />
          <AppIcon v-else-if="wizard.stepStatus(step) === 'error'" name="error" :size="12" weight="fill" />
          <AppIcon v-else-if="wizard.stepStatus(step) === 'warn'" name="warn" :size="12" weight="fill" />
        </span>
        {{ STEP_LABELS[step] }}
      </button>
    </nav>

    <main class="wizard-main">
      <StepProblems v-if="!STEPS_WITHOUT_INLINE_PROBLEMS.has(state.step)" :wizard="wizard" />
      <component :is="stepComponents[state.step]" :wizard="wizard" />
    </main>
  </div>

  <footer class="site-footer">
    <span>
      TaxInANutshell —
      <a class="footer-link" href="https://qassist.io" target="_blank" rel="noopener noreferrer">a QAssist product</a>
    </span>
    <span>HMRC-recognised for CT600 and FRS 105 accounts</span>
    <span class="site-footer-right">No cookies. No analytics. Only a submission status ID is stored server-side.</span>
  </footer>

  <ImportTrialBalanceDialog v-if="state.importOpen" :wizard="wizard" />
</template>
