<script setup lang="ts">
import { ref } from 'vue'
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state } = props.wizard
const dragOver = ref(false)

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) props.wizard.importFile(file)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) props.wizard.importFile(file)
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="wizard.importClose()">
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Import trial balance">
      <div class="dialog-title">Import trial balance</div>

      <template v-if="state.importStage === 'drop'">
        <p class="dialog-body">
          Drop a CSV export of your trial balance. Columns for account name, and either debit/credit or a signed
          amount, are read automatically — nothing leaves this browser.
        </p>
        <div
          class="card"
          :style="{ textAlign: 'center', padding: '32px', borderColor: dragOver ? 'var(--color-accent)' : 'var(--color-divider)', border: '1.5px dashed' }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <p class="card-body">Drag a CSV file here, or</p>
          <label class="btn btn-secondary" style="cursor:pointer;">
            Choose file
            <input type="file" accept=".csv,text/csv" style="display:none" @change="onFileInput">
          </label>
        </div>
      </template>

      <template v-else>
        <p class="dialog-body">
          {{ state.importRows.length }} rows read from {{ state.importFileName }}.
          {{ state.importRows.filter(r => !r.mapsTo).length }} could not be classified automatically —
          add those figures by hand afterwards if needed.
        </p>
        <div style="max-height: 320px; overflow: auto;">
          <table class="table">
            <thead>
              <tr><th>Account</th><th>Amount</th><th>Maps to</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in state.importRows" :key="i">
                <td>{{ row.name }}</td>
                <td class="num">£{{ Math.abs(row.amount).toLocaleString('en-GB') }}</td>
                <td>
                  <span v-if="row.mapsTo" class="tag tag-accent">{{ row.mapsTo }}</span>
                  <span v-else class="tag tag-accent-2">Unmatched</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" @click="wizard.importClose()">Cancel</button>
        <button
          v-if="state.importStage === 'map'" type="button" class="btn btn-primary"
          @click="wizard.importApply()"
        >
          Apply to balance sheet
        </button>
      </div>
    </div>
  </div>
</template>
