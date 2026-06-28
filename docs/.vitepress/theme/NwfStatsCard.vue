<script setup lang="ts">
import { data } from './stats.data'

const fmt = (n: number) => n.toLocaleString('en-US')

const stats = [
  { lbl: 'Standard JSON feed', big: `${fmt(data.jsonBytes)} bytes`, accent: '#ffb38a' },
  { lbl: 'Neurowire NWF', big: `${fmt(data.nwfBytes)} bytes`, accent: '#ff5c39' },
  { lbl: 'Smaller', big: `${data.smaller}%`, accent: '#e8401f' },
]
</script>

<template>
  <div class="nwf-stats">
    <p class="nwf-stats__cap">The same {{ data.entries }}-entry feed</p>
    <article v-for="s in stats" :key="s.lbl" class="nwf-stat" :style="{ '--rail': s.accent }">
      <span class="nwf-stat__lbl">{{ s.lbl }}</span>
      <span class="nwf-stat__big">{{ s.big }}</span>
    </article>
  </div>
</template>
