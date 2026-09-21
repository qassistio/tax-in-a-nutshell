<script setup lang="ts">
import type { useFilingWizard } from '../composables/useFilingWizard'

const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { f } = props.wizard
</script>

<template>
  <div class="step-kicker">Step 2</div>
  <h2>Company details</h2>
  <p class="text-muted">Match these exactly to Companies House and HMRC records.</p>

  <div class="field-grid">
    <div class="field">
      <label for="companyName">Company name</label>
      <input id="companyName" v-model="f.companyName" class="input" placeholder="Acme Consulting Ltd">
    </div>
    <div class="field">
      <label for="companyNumber">Companies House number</label>
      <input id="companyNumber" v-model="f.companyNumber" class="input" placeholder="12345678">
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

  <div class="step-footer">
    <button type="button" class="btn btn-secondary" @click="wizard.move(-1)"><AppIcon name="back" :size="14" />Back</button>
    <button type="button" class="btn btn-primary" @click="wizard.move(1)">Continue<AppIcon name="forward" :size="14" /></button>
  </div>
</template>
