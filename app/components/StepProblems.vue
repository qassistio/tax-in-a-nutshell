<script setup lang="ts">
import { computed } from 'vue'
import type { useFilingWizard } from '../composables/useFilingWizard'

// Shown once at the top of every step (see app.vue) — the same `problems`
// list the Review screen aggregates (app/domain/validation/problems.ts et
// al.), just filtered down to whatever names *this* step, so a filer can
// see what's outstanding without having to jump ahead to Review. Not
// rendered on Review itself, which already lists everything with its own
// "jump to step" links.
//
// Only shown once the step is "stale" (state.visitedSteps — see go()/
// move() in useFilingWizard.ts): a step you've only just arrived at and
// haven't had a chance to fill in yet shouldn't greet you with "this is
// blank" errors — those only appear once you've left the step at least
// once, including on a later revisit.
const props = defineProps<{ wizard: ReturnType<typeof useFilingWizard> }>()
const { state, problems } = props.wizard

const stepProblems = computed(() => state.visitedSteps.has(state.step) ? problems.value.filter(p => p.step === state.step) : [])
</script>

<template>
  <div v-if="stepProblems.length" class="problem-list" style="margin-bottom: var(--space-4);">
    <div v-for="p in stepProblems" :key="p.id" class="problem" style="cursor: default;" :class="p.sev === 'error' ? 'problem-error' : 'problem-warn'">
      <span>
        <span class="tag" :class="p.sev === 'error' ? 'tag-accent-2' : 'tag-neutral'">{{ p.sev === 'error' ? 'Fix' : 'Check' }}</span>
        <span class="problem-title">{{ p.title }}</span><br>
        <span class="problem-detail">{{ p.detail }}</span>
      </span>
    </div>
  </div>
</template>
