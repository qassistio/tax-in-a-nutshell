<script setup lang="ts">
import { ref } from 'vue'
import type { useFilingWizard } from '../composables/useFilingWizard'
import { SUBMISSION_STATUS_LABELS } from '../domain/filing/submissionStatus'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, f, deadlines, corporationTax, accountsIxbrl, taxComputationIxbrl } = props.wizard

function download(filename: string, content: string, mime = 'application/xhtml+xml') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadAccountsIxbrl() {
  download(`${f.companyName || 'accounts'}-accounts.html`, accountsIxbrl.value)
}
function downloadTaxComputationIxbrl() {
  download(`${f.companyName || 'company'}-tax-computation.html`, taxComputationIxbrl.value)
}
function downloadReceipt() {
  download(`${f.companyName || 'filing'}-receipt.json`, JSON.stringify({
    company: { name: f.companyName, number: f.companyNumber, utr: f.utr },
    period: { start: f.periodStart, end: f.periodEnd },
    approval: state.approval,
    hmrcReceipt: state.hmrcReceipt,
    companiesHouseReceipt: state.chReceipt,
    corporationTax: corporationTax.value.corporationTax,
    fields: { ...f }
  }, null, 2), 'application/json')
}

// --- Amendments (requirements.md §31) ---
const amendmentReason = ref('')
const amendmentError = ref('')
async function onReceiptFilePicked(event: Event) {
  amendmentError.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await props.wizard.createAmendmentFromReceipt(text, amendmentReason.value || 'Amendment')
    amendmentReason.value = ''
  } catch (err) {
    amendmentError.value = (err as Error).message || 'Could not read that receipt file.'
  }
}
</script>

<template>
  <div class="receipt-mark">
    <AppIcon v-if="state.hmrcReceipt?.status === 'rejected'" name="error" :size="28" weight="fill" />
    <AppIcon v-else name="check" :size="28" weight="fill" />
  </div>
  <h2>{{ state.hmrcReceipt?.status === 'rejected' ? 'Submission failed' : 'Submitted' }}</h2>

  <div class="card elev-sm" style="margin-top: var(--space-4);">
    <div class="card-kicker">{{ f.companyName || 'Company' }}</div>
    <div class="card-title">Filed for the period ending {{ f.periodEnd || '—' }}</div>
    <p class="card-body">
      Corporation Tax payment due {{ deadlines.corporationTaxPaymentDue?.toLocaleDateString('en-GB') ?? '—' }}.
    </p>
  </div>

  <h4 style="margin-top: var(--space-6);">HMRC</h4>
  <p v-if="state.hmrcReceipt">
    <span class="tag" :class="state.hmrcReceipt.status === 'rejected' ? 'tag-accent-2' : 'tag-accent'">
      {{ SUBMISSION_STATUS_LABELS[state.hmrcReceipt.status] }}
    </span>
    {{ state.hmrcReceipt.message }}
  </p>
  <p v-else class="text-muted">No Company Tax Return was included in this filing.</p>

  <h4>Companies House</h4>
  <p v-if="state.chReceipt" class="text-muted">{{ state.chReceipt.message }}</p>
  <p v-else class="text-muted">No accounts were included in this filing.</p>

  <h4 style="margin-top: var(--space-6);">Downloads</h4>
  <div class="step-footer" style="justify-content: flex-start; gap: var(--space-3);">
    <button type="button" class="btn btn-secondary" @click="downloadAccountsIxbrl">
      <AppIcon name="download" :size="14" />Accounts (iXBRL)
    </button>
    <button type="button" class="btn btn-secondary" @click="downloadTaxComputationIxbrl">
      <AppIcon name="download" :size="14" />Tax computation (iXBRL)
    </button>
    <button type="button" class="btn btn-secondary" @click="downloadReceipt">
      <AppIcon name="receipt" :size="14" />Receipt (JSON)
    </button>
  </div>
  <p class="text-muted" style="margin-top: var(--space-3); font-size: 13px;">
    The iXBRL documents are structural drafts — verify the tagged elements against the current FRS 105 and HMRC CT
    taxonomies before relying on them. Keep the downloaded receipt: it's what you'll need to open an amendment later,
    since nothing from this session is kept anywhere but this browser tab.
  </p>

  <h4 style="margin-top: var(--space-6);">Amendments</h4>
  <p class="text-muted" style="font-size: 13px;">
    The original filing never changes. To amend it, re-open this wizard, change the figures that need correcting,
    then come back here, give a reason, and upload the receipt you downloaded from the filing you're amending —
    the two will be compared and chained as a new amendment.
  </p>
  <div class="field-grid">
    <div class="field">
      <label for="amendReason">Reason for amendment</label>
      <input id="amendReason" v-model="amendmentReason" class="input" placeholder="e.g. Correction to staff costs">
    </div>
    <div class="field">
      <label for="amendFile">Previous receipt (JSON)</label>
      <input id="amendFile" type="file" accept=".json" class="input" @change="onReceiptFilePicked">
    </div>
  </div>
  <p v-if="amendmentError" class="tag tag-accent-2">{{ amendmentError }}</p>

  <div v-for="a in state.amendments" :key="a.sequence" class="card elev-sm" style="margin-top: var(--space-3);">
    <div class="card-kicker">Amendment {{ a.sequence }}</div>
    <div class="card-title">{{ a.reason }}</div>
    <p class="card-body">
      Tax difference: {{ a.taxDifference >= 0 ? '+' : '' }}£{{ a.taxDifference.toLocaleString('en-GB') }}
    </p>
    <ul v-if="a.changes.length" style="margin: 0; padding-left: 1.2em; font-size: 13px;">
      <li v-for="c in a.changes" :key="c.field">{{ c.label }}: {{ c.previous || '0' }} → {{ c.next || '0' }}</li>
    </ul>
  </div>
</template>
