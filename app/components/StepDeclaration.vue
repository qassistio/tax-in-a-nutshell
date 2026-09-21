<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, canSubmit } = props.wizard

async function submit() {
  if (!canSubmit.value) return
  await props.wizard.approveFiling()
  if (state.filings.ct600) await props.wizard.submitToHmrc()
  // Normally already done at the dedicated Companies House step earlier in
  // the wizard — this is just a fallback for anyone who jumped straight to
  // Declaration via the step nav without visiting it.
  if (state.filings.companiesHouse && !state.chReceipt) await props.wizard.submitToCompaniesHouse()
  props.wizard.move(1)
}
</script>

<template>
  <div class="step-kicker">Declaration</div>
  <h2>Declare and submit</h2>
  <p class="text-muted">
    This declares that, to the best of the signatory's knowledge, the information given is correct and complete.
  </p>

  <div class="field-grid">
    <div class="field">
      <label for="declName">Signed by</label>
      <input id="declName" v-model="f.declName" class="input">
    </div>
    <div class="field">
      <label for="declRole">Role</label>
      <input id="declRole" v-model="f.declRole" class="input" placeholder="Director">
    </div>
  </div>

  <h4 style="margin-top: var(--space-4);">Government Gateway credentials</h4>
  <p class="text-muted" style="font-size:13px;">
    Used only to sign this submission to HMRC — kept in this browser's memory and cleared the moment the tab closes.
  </p>
  <div class="field-grid">
    <div class="field">
      <label for="gwUser">Government Gateway user ID</label>
      <input id="gwUser" v-model="f.gwUser" class="input" autocomplete="off">
    </div>
    <div class="field">
      <label for="gwPass">Government Gateway password</label>
      <input id="gwPass" v-model="f.gwPass" type="password" class="input" autocomplete="off">
    </div>
    <div class="field">
      <label for="vendorId">HMRC vendor ID</label>
      <input id="vendorId" v-model="state.vendorId" class="input" autocomplete="off">
    </div>
    <div class="field">
      <label for="testInLive">Submission mode</label>
      <select id="testInLive" v-model="state.testInLive" class="input">
        <option :value="true">Test-in-live (HMRC-CT-CT600-TIL)</option>
        <option :value="false">Live (HMRC-CT-CT600)</option>
      </select>
    </div>
  </div>
  <p class="text-muted" style="font-size:13px;">
    This calls HMRC's real GovTalk submission gateway with the envelope built in this browser. It has not been
    verified end-to-end against a live Government Gateway account — leave submission mode on Test-in-live until
    you've checked a real response.
  </p>

  <label class="radio" style="margin-top: var(--space-4);">
    <input v-model="state.declarationAgreed" type="checkbox">
    <span>I confirm the information given is correct and complete, and I am authorised to make this declaration.</span>
  </label>

  <p v-if="state.submitError" class="tag tag-accent-2" style="margin-top: var(--space-3);">{{ state.submitError }}</p>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!canSubmit || state.submitting" @click="submit">
      <AppIcon v-if="state.submitting" name="spinner" :size="14" />
      {{ state.submitting ? 'Submitting…' : 'Submit' }}
    </button>
  </div>
</template>
