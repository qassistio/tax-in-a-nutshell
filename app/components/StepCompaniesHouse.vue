<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'
import { SUBMISSION_STATUS_LABELS } from '../domain/filing/submissionStatus'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, accountsIxbrl, canContinue } = props.wizard

async function submitToCh() {
  await props.wizard.submitToCompaniesHouse()
}

function downloadAccountsIxbrl() {
  const blob = new Blob([accountsIxbrl.value], { type: 'application/xhtml+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${f.companyName || 'accounts'}-accounts.html`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="step-kicker">Step {{ props.wizard.currentIndex.value + 1 }}</div>
  <h2>Companies House</h2>
  <p class="text-muted">
    Now we'll file your statutory accounts with Companies House, using the same balance sheet and profit and
    loss figures you've just entered.
  </p>

  <div class="card elev-sm">
    <div class="card-kicker">Before you submit</div>
    <p class="card-body">
      You'll need this company's Companies House authentication code — the one Companies House posted to your
      registered office, not a password you set yourself. If you don't have it to hand, you can request or reset
      it on the Companies House website.
    </p>
  </div>

  <h4 style="margin-top: var(--space-4);">This company's Companies House details</h4>
  <p class="text-muted" style="font-size:13px;">
    Kept in this browser's memory and cleared the moment the tab closes.
  </p>
  <div class="field-grid">
    <div class="field">
      <label for="chCompanyAuthCode">Company authentication code</label>
      <input id="chCompanyAuthCode" v-model="f.chCompanyAuthCode" type="password" class="input" autocomplete="off">
    </div>
    <div class="field">
      <label for="chEmail">Contact email</label>
      <input id="chEmail" v-model="f.chEmail" type="email" class="input" autocomplete="off">
    </div>
  </div>

  <div v-if="state.chReceipt" class="card elev-sm" style="margin-top: var(--space-4);">
    <div class="card-kicker">
      <span class="tag" :class="state.chReceipt.status === 'rejected' ? 'tag-accent-2' : 'tag-accent'">
        {{ SUBMISSION_STATUS_LABELS[state.chReceipt.status] }}
      </span>
    </div>
    <p class="card-body">{{ state.chReceipt.message }}</p>
  </div>

  <div class="step-footer" style="justify-content: flex-start; gap: var(--space-3); margin-top: var(--space-4);">
    <button type="button" class="btn btn-secondary" @click="downloadAccountsIxbrl">
      <AppIcon name="download" :size="14" />Accounts (iXBRL)
    </button>
  </div>

  <!-- Continue here isn't a plain nav button — submitting to Companies
       House IS the "continue" action for this step (there's nothing else
       to do before moving on), so it replaces the usual Continue button
       until a non-rejected receipt exists; after that, Continue behaves
       like every other step. See canContinue in useFilingWizard.ts. -->
  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button v-if="!canContinue.value" type="button" class="btn btn-primary" :disabled="state.chSubmitting" @click="submitToCh">
      <AppIcon v-if="state.chSubmitting" name="spinner" :size="14" />
      <AppIcon v-else name="submit" :size="14" />
      {{ state.chSubmitting ? 'Submitting…' : state.chReceipt ? 'Retry submission' : 'Submit accounts to Companies House' }}
    </button>
    <button v-else type="button" class="btn btn-primary" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
