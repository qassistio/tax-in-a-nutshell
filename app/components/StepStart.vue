<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state } = props.wizard
</script>

<template>
  <div class="step-kicker">Before you start</div>
  <h2>What are you filing?</h2>
  <p class="text-muted">
    Choose what this return covers. Most companies below the micro-entity thresholds file all three together.
  </p>

  <label class="filing-choice">
    <input v-model="state.filings.accounts" type="checkbox">
    <span>
      <strong>Micro-entity accounts</strong><br>
      <span class="text-muted">A balance sheet and profit and loss account, prepared under FRS 105.</span>
    </span>
  </label>
  <label class="filing-choice">
    <input v-model="state.filings.ct600" type="checkbox">
    <span>
      <strong>Company Tax Return (CT600)</strong><br>
      <span class="text-muted">Corporation Tax computation and return, filed with HMRC.</span>
    </span>
  </label>
  <label class="filing-choice">
    <input v-model="state.filings.companiesHouse" type="checkbox">
    <span>
      <strong>File accounts with Companies House</strong><br>
      <span class="text-muted">Sends the same accounts on to the public register.</span>
    </span>
  </label>

  <p class="text-muted" style="margin-top: var(--space-4); font-size: 13px;">
    Held in this browser only — nothing is sent until you submit. Closing this tab clears every figure you entered,
    including your gateway credentials. There is no account to sign out of.
  </p>

  <div class="step-footer">
    <span />
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Start</button>
  </div>
</template>
