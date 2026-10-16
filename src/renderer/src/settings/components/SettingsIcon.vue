<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  power: 'M12 2v10M6.3 5a9 9 0 1 0 11.4 0',
  application: 'M9 3h6l.5 3 2 1.2 2.8-.9 2 3.4-2.3 2v2.6l2.3 2-2 3.4-2.8-.9-2 1.2-.5 3H9l-.5-3-2-1.2-2.8.9-2-3.4 2.3-2v-2.6l-2.3-2 2-3.4 2.8.9 2-1.2L9 3ZM15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  speed: 'M4 18a9 9 0 1 1 16 0M12 13l5-5M5 12h2M17 12h2M8 6l1 2M12 4v2M12 13h.01',
  direction: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5ZM8 10h8M8 14h5',
  appearance: 'M12 3a9 9 0 1 0 0 18h1.4a2.1 2.1 0 0 0 1.5-3.6 1.2 1.2 0 0 1 .8-2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9ZM7.5 9h.01M11 6.5h.01M16 8h.01M6.5 13h.01',
  keyboard: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM7 9h.01M11 9h.01M15 9h.01M18 9h.01M7 12h.01M11 12h.01M15 12h.01M18 12h.01M8 16h8',
  room: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  monitor: 'M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 21h8M12 17v4',
  text: 'M4 5h16M12 5v15M8 20h8',
  position: 'M4 3h16v18H4ZM8 7h8M8 11h6M8 15h8',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  wifi: 'M2 8.8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0M12 19h.01',
  link: 'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3ZM9 12l2 2 4-4',
  check: 'M5 12l4 4L19 6',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
  arrow: 'M9 5l7 7-7 7'
}
</script>

<template>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name] || paths.message" />
  </svg>
</template>
