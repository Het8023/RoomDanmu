<script setup lang="ts">
import { ref, onMounted } from 'vue'

const text = ref('')
const nickname = ref('')
const roomCode = ref('')
const hotkey = ref('')
const memberCount = ref(0)
const mode = ref<'dm' | 'nick' | 'room'>('dm')
const inputEl = ref<HTMLInputElement | null>(null)

const isEditMode = () => mode.value === 'nick' || mode.value === 'room'

function applyMode(m: string): void {
  if (m === 'nick' || m === 'room') {
    mode.value = m
    text.value = m === 'nick' ? nickname.value : roomCode.value
  } else {
    mode.value = 'dm'
    text.value = ''
  }
  // 等待窗口显示后聚焦
  setTimeout(() => inputEl.value?.focus(), 30)
}

async function init(): Promise<void> {
  const d = await window.api.getInitData()
  nickname.value = d.nickname
  roomCode.value = d.roomCode
  hotkey.value = d.hotkey
  memberCount.value = d.memberCount
  // 初始化时应用主进程指定的模式（修复首次打开时 set-mode 消息丢失）
  if (d.mode === 'nick' || d.mode === 'room') applyMode(d.mode)
}

window.api.onSetMode(applyMode)
window.api.onRoomInfo((d) => {
  memberCount.value = d.memberCount
})

function confirm(): void {
  if (isEditMode()) {
    const v = text.value.trim()
    if (!v) {
      window.api.closeInput()
      return
    }
    window.api.saveField(mode.value === 'nick' ? 'nickname' : 'roomCode', v)
    if (mode.value === 'nick') nickname.value = v
    else roomCode.value = v.toUpperCase()
    return
  }
  const t = text.value.trim()
  if (!t) return
  window.api.sendDanmaku(t)
  text.value = ''
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirm()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    window.api.closeInput()
  }
}

onMounted(() => {
  init()
  setTimeout(() => inputEl.value?.focus(), 30)
})
</script>

<template>
  <div class="box" :class="{ edit: isEditMode() }">
    <template v-if="isEditMode()">
      <div class="title">{{ mode === 'nick' ? '修改昵称（回车保存）' : '修改房间号（回车保存）' }}</div>
      <input ref="inputEl" v-model="text" class="field" maxlength="20" @keydown="onKey" />
      <div class="meta">Esc 取消</div>
    </template>
    <template v-else>
      <input ref="inputEl" v-model="text" class="field" placeholder="输入弹幕，回车发送" maxlength="200" @keydown="onKey" />
      <div class="meta">
        {{ nickname }} · 房间 {{ roomCode }} · {{ memberCount }} 人在线 · 热键 {{ hotkey }} · Esc 关闭
      </div>
    </template>
  </div>
</template>

<style scoped>
.box {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(20, 24, 40, 0.92);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
}
.title {
  color: #ffd666;
  font-size: 13px;
  margin-bottom: 6px;
}
.field {
  width: 100%;
  box-sizing: border-box;
  font-size: 16px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  outline: none;
}
.field::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
.meta {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
