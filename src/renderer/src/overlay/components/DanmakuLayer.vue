<script setup lang="ts">
import { ref, onUnmounted, type ObjectDirective } from 'vue'

type Direction = 'right-to-left' | 'left-to-right' | 'bottom-to-top' | 'top-to-bottom'

interface DmItem {
  id: number
  text: string
  name: string
  lane: number
  duration: number
  speed: number
  direction: Direction
  position: 'top' | 'middle' | 'bottom'
}

interface StyleState {
  danmakuColor: string
  danmakuFontSize: number
  danmakuPosition: 'top' | 'middle' | 'bottom'
  danmakuDuration: number
  danmakuSpeed: number
  danmakuDirection: Direction
}

const LANES = 6
const LANE_TOPS: Record<'top' | 'middle' | 'bottom', number[]> = {
  top: [3, 11, 19, 27, 35, 43],
  middle: [26, 34, 42, 50, 58, 66],
  bottom: [56, 64, 72, 80, 88, 96]
}
const laneBusyUntil = new Array<number>(LANES).fill(0)

const items = ref<DmItem[]>([])
const style = ref<StyleState>({ danmakuColor: '#ffffff', danmakuFontSize: 26, danmakuPosition: 'top', danmakuDuration: 9, danmakuSpeed: 160, danmakuDirection: 'right-to-left' })
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const animations = new Map<number, Animation>()
let seq = 0

const removeStyleListener = window.api.onStyle((s) => {
  style.value = { ...style.value, ...s }
})

function pickLane(): number {
  const now = Date.now()
  let soonest = 0
  let soonestIdx = 0
  for (let i = 0; i < LANES; i++) {
    if (laneBusyUntil[i] <= now) return i
    if (i === 0 || laneBusyUntil[i] < soonest) {
      soonest = laneBusyUntil[i]
      soonestIdx = i
    }
  }
  return soonestIdx
}

function removeItem(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const animation = animations.get(id)
  if (animation) {
    animation.onfinish = null
    animation.cancel()
    animations.delete(id)
  }
  items.value = items.value.filter((item) => item.id !== id)
}

const vMove: ObjectDirective<HTMLElement, DmItem> = {
  mounted(element, { value: item }) {
    const viewport = element.parentElement!
    const width = element.offsetWidth
    const height = element.offsetHeight
    const vertical = item.direction === 'bottom-to-top' || item.direction === 'top-to-bottom'
    const distance = vertical ? viewport.clientHeight + height : viewport.clientWidth + width
    let fromX = 0
    let toX = 0
    let fromY = 0
    let toY = 0
    if (vertical) {
      element.style.top = '0'
      const columnCenter = (item.lane + 0.5) / LANES * viewport.clientWidth
      element.style.left = Math.max(0, Math.min(viewport.clientWidth - width, columnCenter - width / 2)) + 'px'
      fromY = item.direction === 'bottom-to-top' ? viewport.clientHeight : -height
      toY = item.direction === 'bottom-to-top' ? -height : viewport.clientHeight
    } else {
      element.style.top = LANE_TOPS[item.position][item.lane] + '%'
      fromX = item.direction === 'right-to-left' ? viewport.clientWidth : -width
      toX = item.direction === 'right-to-left' ? -width : viewport.clientWidth
    }
    // 行程只由距离和速度决定；显示时长是独立的移除计时器。
    const travelTime = distance / item.speed * 1000
    const animation = element.animate([
      { transform: `translate3d(${fromX}px, ${fromY}px, 0)` },
      { transform: `translate3d(${toX}px, ${toY}px, 0)` }
    ], { duration: travelTime, easing: 'linear', fill: 'forwards' })
    animations.set(item.id, animation)
    element.style.visibility = 'visible'
    animation.onfinish = () => removeItem(item.id)
    timers.set(item.id, setTimeout(() => removeItem(item.id), item.duration))
    laneBusyUntil[item.lane] = Date.now() + Math.min(item.duration, travelTime)
  }
}

const removeDanmakuListener = window.api.onDanmaku((d) => {
  const lane = pickLane()
  const id = ++seq
  // 每条弹幕固定使用收到时的时长，修改设置不影响正在播放的消息。
  const duration = style.value.danmakuDuration * 1000
  laneBusyUntil[lane] = Date.now() + duration
  items.value.push({ id, text: d.text, name: d.name, lane, duration,
    speed: style.value.danmakuSpeed, direction: style.value.danmakuDirection, position: style.value.danmakuPosition })
})

onUnmounted(() => {
  removeStyleListener()
  removeDanmakuListener()
  for (const timer of timers.values()) clearTimeout(timer)
  for (const animation of animations.values()) { animation.onfinish = null; animation.cancel() }
})
</script>

<template>
  <div class="layer">
    <div
      v-for="item in items"
      :key="item.id"
      v-move="item"
      class="dm"
    >
      <div class="dm-text" :style="{ fontSize: style.danmakuFontSize + 'px', color: style.danmakuColor }">
        {{ item.text }}
      </div>
      <div class="dm-name" :style="{ fontSize: Math.max(12, Math.round(style.danmakuFontSize * 0.55)) + 'px' }">
        {{ item.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.dm {
  position: absolute;
  left: 0;
  visibility: hidden;
  will-change: transform;
  white-space: nowrap;
  text-align: center;
}
.dm-text {
  font-weight: 600;
  line-height: 1.15;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.5);
}
.dm-name {
  margin-top: 2px;
  font-weight: 400;
  color: #ffd666;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
  opacity: 0.92;
}
</style>
