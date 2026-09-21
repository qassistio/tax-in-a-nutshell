<script setup lang="ts">
import { ref } from 'vue'
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f } = props.wizard

// requirements.md §3.1 — retrieve public company information from
// Companies House automatically rather than have the filer type it in.
const searchQuery = ref('')
const searching = ref(false)
const searchError = ref('')
const searchResults = ref<Array<{ companyNumber: string; companyName: string; status?: string; addressSnippet?: string }>>([])
const lookingUp = ref(false)

async function runSearch() {
  searchError.value = ''
  searchResults.value = []
  if (!searchQuery.value.trim()) return
  searching.value = true
  try {
    searchResults.value = await props.wizard.searchCompaniesHouse(searchQuery.value)
    if (!searchResults.value.length) searchError.value = 'No companies found matching that search.'
  } catch (err) {
    searchError.value = (err as Error).message || 'Companies House search failed.'
  } finally {
    searching.value = false
  }
}

async function pickResult(companyNumber: string) {
  await lookup(companyNumber)
  searchResults.value = []
  searchQuery.value = ''
}

async function lookup(companyNumber: string) {
  const number = (companyNumber || f.companyNumber).trim()
  if (!number) return
  searchError.value = ''
  lookingUp.value = true
  try {
    await props.wizard.applyCompanyLookup(number)
  } catch (err) {
    searchError.value = (err as Error).message || 'Could not look up that company number.'
  } finally {
    lookingUp.value = false
  }
}
</script>

<template>
  <div class="step-kicker">Step {{ wizard.currentIndex.value + 1 }}</div>
  <h2>Company details</h2>
  <p class="text-muted">Match these exactly to Companies House and HMRC records.</p>

  <div class="field-grid">
    <div class="field" style="grid-column: 1 / -1;">
      <label for="chSearch">Find on Companies House</label>
      <div style="display: flex; gap: var(--space-2);">
        <input
          id="chSearch" v-model="searchQuery" class="input" placeholder="Search by company name…"
          @keyup.enter="runSearch"
        >
        <button type="button" class="btn btn-secondary" :disabled="searching" @click="runSearch">
          <AppIcon v-if="searching" name="spinner" :size="14" />{{ searching ? 'Searching…' : 'Search' }}
        </button>
      </div>
      <p v-if="searchError" class="tag tag-accent-2" style="margin-top: var(--space-2);">{{ searchError }}</p>
      <ul v-if="searchResults.length" class="card elev-sm" style="margin-top: var(--space-2); list-style: none; padding: 0;">
        <li v-for="r in searchResults" :key="r.companyNumber">
          <button
            type="button" class="wizard-nav-item" style="width: 100%;"
            @click="pickResult(r.companyNumber)"
          >
            <strong>{{ r.companyName }}</strong>&nbsp;— {{ r.companyNumber }}
            <span v-if="r.status" class="text-muted">({{ r.status }})</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="field">
      <label for="companyName">Company name</label>
      <input id="companyName" v-model="f.companyName" class="input" placeholder="Acme Consulting Ltd">
    </div>
    <div class="field">
      <label for="companyNumber">Companies House number</label>
      <div style="display: flex; gap: var(--space-2);">
        <input id="companyNumber" v-model="f.companyNumber" class="input" placeholder="12345678">
        <button type="button" class="btn btn-secondary" :disabled="lookingUp || !f.companyNumber.trim()" @click="lookup(f.companyNumber)">
          <AppIcon v-if="lookingUp" name="spinner" :size="14" />{{ lookingUp ? 'Looking up…' : 'Look up' }}
        </button>
      </div>
    </div>
    <div class="field">
      <label for="utr">Unique Taxpayer Reference (UTR)</label>
      <input id="utr" v-model="f.utr" class="input" placeholder="10 digits">
    </div>
    <div class="field">
      <label for="sic">SIC code</label>
      <input id="sic" v-model="f.sic" class="input" placeholder="62020">
    </div>
    <div class="field">
      <label for="address">Registered office address</label>
      <input id="address" v-model="f.address" class="input">
    </div>
    <div class="field">
      <label for="postcode">Postcode</label>
      <input id="postcode" v-model="f.postcode" class="input">
    </div>
  </div>
  <p class="text-muted" style="font-size: 13px; margin-top: var(--space-2);">
    Search or look-up pulls from Companies House's public register — the Unique Taxpayer Reference isn't public
    data, so that still needs entering by hand.
  </p>

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" :disabled="!wizard.canContinue.value" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
