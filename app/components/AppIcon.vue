<script setup lang="ts">
// Thin wrapper around Phosphor's per-icon components so the rest of the app
// can reference an icon by name without every file needing its own import,
// and so the duotone weight/size/color are applied consistently.
import { computed } from 'vue'
import {
  PhCheckCircle, PhWarningCircle, PhWarning, PhCircle, PhBuildings, PhBank, PhFileText,
  PhCalendarCheck, PhUploadSimple, PhDownloadSimple, PhPaperPlaneTilt, PhLockKey, PhShieldCheck,
  PhArrowLeft, PhArrowRight, PhReceipt, PhSpinnerGap, PhClockCounterClockwise, PhNotePencil, PhX
} from '@phosphor-icons/vue'

const ICONS = {
  check: PhCheckCircle,
  error: PhWarningCircle,
  warn: PhWarning,
  circle: PhCircle,
  company: PhBuildings,
  bank: PhBank,
  document: PhFileText,
  deadline: PhCalendarCheck,
  upload: PhUploadSimple,
  download: PhDownloadSimple,
  submit: PhPaperPlaneTilt,
  gateway: PhLockKey,
  shield: PhShieldCheck,
  back: PhArrowLeft,
  forward: PhArrowRight,
  receipt: PhReceipt,
  spinner: PhSpinnerGap,
  history: PhClockCounterClockwise,
  amend: PhNotePencil,
  close: PhX
} as const

export type IconName = keyof typeof ICONS

const props = withDefaults(defineProps<{ name: IconName; weight?: 'duotone' | 'regular' | 'bold' | 'fill'; size?: number | string }>(), {
  weight: 'duotone',
  size: 18
})

const component = computed(() => ICONS[props.name])
</script>

<template>
  <component :is="component" :weight="weight" :size="size" />
</template>
