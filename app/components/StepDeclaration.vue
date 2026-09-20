<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, canSubmit } = props.wizard

function submit() {
  if (canSubmit.value) props.wizard.move(1)
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
  </div>

  <label class="radio" style="margin-top: var(--space-4);">
    <input v-model="state.declarationAgreed" type="checkbox">
    <span>I confirm the information given is correct and complete, and I am authorised to make this declaration.</span>
  </label>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)">Back</button>
    <button type="button" class="btn btn-primary" :disabled="!canSubmit" @click="submit">Submit</button>
  </div>
</template>
