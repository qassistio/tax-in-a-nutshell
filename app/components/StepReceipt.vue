<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f, deadlines } = props.wizard
</script>

<template>
  <div class="receipt-mark">✓</div>
  <h2>Submitted</h2>
  <p class="text-muted">
    This is a preview build: nothing has actually been sent to HMRC or Companies House. In the finished product this
    screen shows the real gateway acknowledgement once the return has been transmitted.
  </p>

  <div class="card elev-sm" style="margin-top: var(--space-4);">
    <div class="card-kicker">{{ f.companyName || 'Company' }}</div>
    <div class="card-title">Filed for the period ending {{ f.periodEnd || '—' }}</div>
    <p class="card-body">
      Corporation Tax payment due {{ deadlines.corporationTaxPaymentDue?.toLocaleDateString('en-GB') ?? '—' }}.
    </p>
  </div>

  <p class="text-muted" style="margin-top: var(--space-4); font-size: 13px;">
    Nothing entered in this session was stored anywhere outside this browser tab.
  </p>
</template>
