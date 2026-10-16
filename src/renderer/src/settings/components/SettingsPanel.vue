<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import SettingsIcon from './SettingsIcon.vue'

interface FormState {
  nickname: string
  roomCode: string
  peerAddress: string
  hotkey: string
  danmakuColor: string
  danmakuFontSize: number
  danmakuDuration: number
  danmakuSpeed: number
  danmakuDirection: 'right-to-left' | 'left-to-right' | 'bottom-to-top' | 'top-to-bottom'
  danmakuPosition: 'top' | 'middle' | 'bottom'
}
type Section = 'appearance' | 'keyboard' | 'room' | 'application'
const sections: { id: Section; label: string; description: string }[] = [
  { id: 'appearance', label: '弹幕外观', description: '调整文字样式，让每条消息以你喜欢的方式出现。' },
  { id: 'keyboard', label: '快捷键', description: '用顺手的组合键，随时唤起弹幕输入框。' },
  { id: 'room', label: '房间与连接', description: '设置你的身份，与同一局域网里的朋友建立连接。' },
  { id: 'application', label: '应用', description: '设置房间弹幕的启动方式。' }
]
const activeSection = ref<Section>('appearance')
const contentEl = ref<HTMLElement | null>(null)
watch(activeSection, () => contentEl.value?.scrollTo({ top: 0 }), { flush: 'post' })
const currentSection = computed(() => sections.find((section) => section.id === activeSection.value)!)
const form = ref<FormState>({ nickname: '', roomCode: '', peerAddress: '', hotkey: '', danmakuColor: '#ffffff', danmakuFontSize: 26, danmakuPosition: 'top', danmakuDuration: 9, danmakuSpeed: 160, danmakuDirection: 'right-to-left' })
const network = ref({ ready: false, error: '', addresses: [] as string[], memberCount: 1 })
const status = ref('')
const statusError = ref(false)
const saving = ref(false)
const hotkeyFocus = ref(false)
const loaded = ref(false)
const startup = ref({ supported: false, enabled: false, error: '' })
const startupLoaded = ref(false)
const startupBusy = ref(false)
let networkTimer: ReturnType<typeof setInterval> | undefined
let removeSaveListener: (() => void) | undefined
let alive = true
const PRESET_COLORS = ['#ffffff', '#ffd666', '#ff6b6b', '#4dabff', '#7bed9f', '#ff9ff3', '#b7a4ff', '#f5f5f5']
const positions = [{ value: 'top', label: '顶部' }, { value: 'middle', label: '中部' }, { value: 'bottom', label: '底部' }] as const
const directions = [
  { value: 'right-to-left', label: '从右向左 ←' },
  { value: 'left-to-right', label: '从左向右 →' },
  { value: 'bottom-to-top', label: '从下向上 ↑' },
  { value: 'top-to-bottom', label: '从上向下 ↓' }
] as const
const hotkeyLabels = computed(() => form.value.hotkey.replace('CommandOrControl', 'Ctrl').replace('Super', 'Win').split('+').filter(Boolean))
const validColor = computed(() => /^#[0-9a-f]{6}$/i.test(form.value.danmakuColor))

function showError(message: string): void {
  status.value = message
  statusError.value = true
}

async function refreshNetwork(): Promise<void> {
  try {
    const info = await window.api.getNetworkInfo()
    if (alive) network.value = info
  } catch {
    if (alive) network.value.error = '暂时无法读取连接状态，请重新打开设置。'
  }
}

async function refreshStartup(): Promise<void> {
  if (startupBusy.value) return
  try {
    const state = await window.api.getStartupStatus()
    if (alive) { startup.value = state; startupLoaded.value = true }
  } catch {
    if (alive) startup.value.error = '暂时无法读取开机自启动状态，请重新打开设置。'
  }
}

async function toggleStartup(): Promise<void> {
  if (startupBusy.value || !startupLoaded.value || !startup.value.supported) return
  startupBusy.value = true
  try {
    const state = await window.api.setStartupEnabled(!startup.value.enabled)
    if (alive) startup.value = state
  } catch {
    if (alive) startup.value.error = '开机自启动更新失败，请稍后重试。'
  } finally {
    startupBusy.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onDocKey)
  window.addEventListener('focus', refreshStartup)
  void refreshStartup()
  removeSaveListener = window.api.onSaveResult((result) => {
    saving.value = false
    status.value = result.ok ? '设置已保存' : result.error
    statusError.value = !result.ok
    void refreshNetwork()
  })
  try {
    const settings = await window.api.getSettings()
    if (!alive) return
    form.value = { ...settings }
    loaded.value = true
    await refreshNetwork()
    if (alive) networkTimer = setInterval(() => void refreshNetwork(), 2500)
  } catch {
    showError('设置加载失败，请关闭窗口后重试。')
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onDocKey)
  window.removeEventListener('focus', refreshStartup)
  alive = false
  if (networkTimer) clearInterval(networkTimer)
  removeSaveListener?.()
})

function onHotkeyKey(event: KeyboardEvent): void {
  if (event.key === 'Tab') return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') { (event.target as HTMLButtonElement).blur(); return }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return
  const parts: string[] = []
  if (event.ctrlKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key.startsWith('Arrow')) key = key.slice(5)
  else if (key.length === 1) key = key.toUpperCase()
  if (!/^(?:[A-Z0-9]|Space|Enter|Tab|Up|Down|Left|Right|F(?:[1-9]|1\d|2[0-4]))$/.test(key)) return
  if (parts.length === 0 && !/^F\d+$/.test(key)) {
    showError('请使用 Ctrl / Alt / Shift 等修饰键，或单独使用 F 功能键。')
    return
  }
  form.value.hotkey = parts.concat(key).join('+')
  status.value = ''
}

function save(): void {
  if (!loaded.value || saving.value) return
  if (!form.value.nickname.trim()) { activeSection.value = 'room'; showError('请输入昵称。'); return }
  if (!/^[A-Z0-9]{3,8}$/.test(form.value.roomCode.trim().toUpperCase())) {
    activeSection.value = 'room'; showError('房间号需为 3–8 位字母或数字。'); return
  }
  if (!validColor.value) { activeSection.value = 'appearance'; showError('请输入有效颜色，例如 #4dabff。'); return }
  if (!Number.isInteger(form.value.danmakuDuration) || form.value.danmakuDuration < 1 || form.value.danmakuDuration > 30) {
    activeSection.value = 'appearance'; showError('显示时长需为 1–30 秒的整数。'); return
  }
  if (!Number.isInteger(form.value.danmakuSpeed) || form.value.danmakuSpeed < 30 || form.value.danmakuSpeed > 600) {
    activeSection.value = 'appearance'; showError('移动速度需为 30–600 px/s 的整数。'); return
  }
  saving.value = true
  status.value = ''
  form.value.roomCode = form.value.roomCode.trim().toUpperCase()
  window.api.saveSettings({ ...form.value, nickname: form.value.nickname.trim(), peerAddress: form.value.peerAddress.trim() })
}

function onDocKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !hotkeyFocus.value) window.api.closeSettings()
}
</script>

<template>
  <div class="settings-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark"><SettingsIcon name="message" /></span>
        <div><strong>房间弹幕</strong><span>让交流飘过桌面</span></div>
      </div>
      <div class="nav-caption">偏好设置</div>
      <nav aria-label="设置分类">
        <button v-for="section in sections" :key="section.id" type="button" class="nav-item" :class="{ active: activeSection === section.id }" :aria-current="activeSection === section.id ? 'page' : undefined" @click="activeSection = section.id">
          <SettingsIcon :name="section.id" /><span>{{ section.label }}</span>
        </button>
      </nav>
      <div class="sidebar-foot"><SettingsIcon name="monitor" /><span>只在主屏幕显示</span></div>
    </aside>

    <main class="workspace">
      <div ref="contentEl" class="content-scroll">
        <header class="page-header"><div class="eyebrow">房间弹幕 / 偏好设置</div><h1>设置</h1></header>
        <section class="connection-banner" aria-label="连接状态">
          <span class="status-dot" :class="{ online: network.ready && !network.error }"></span>
          <div class="banner-copy"><strong>{{ network.error ? '连接需要检查' : network.ready ? '局域网已就绪' : '正在准备连接' }}</strong><p>同房间的消息将在你的主屏幕上显示</p></div>
          <span class="online-badge">{{ network.memberCount }} 人在线</span>
        </section>

        <div class="section-heading"><h2>{{ currentSection.label }}</h2><p>{{ currentSection.description }}</p></div>

        <section v-if="activeSection === 'appearance'" class="section-stack" aria-label="弹幕外观">
          <div class="setting-card color-card">
            <SettingsIcon class="row-icon" name="appearance" />
            <div class="setting-body"><h3>文字颜色</h3><p>选择预设颜色，或输入自定义色值</p>
              <div class="color-controls">
                <div class="swatches" role="group" aria-label="预设颜色">
                  <button v-for="color in PRESET_COLORS" :key="color" type="button" class="swatch" :style="{ backgroundColor: color }" :class="{ selected: form.danmakuColor.toLowerCase() === color }" :aria-label="`选择颜色 ${color}`" :aria-pressed="form.danmakuColor.toLowerCase() === color" @click="form.danmakuColor = color"><SettingsIcon v-if="form.danmakuColor.toLowerCase() === color" name="check" :style="{ color: color === '#ffffff' || color === '#f5f5f5' || color === '#ffd666' ? '#334155' : '#ffffff' }" /></button>
                </div>
                <input v-model="form.danmakuColor" class="field hex-field" maxlength="7" aria-label="自定义颜色" placeholder="#ffffff" spellcheck="false" />
              </div>
            </div>
          </div>

          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="text" /><div class="setting-copy"><h3>文字大小</h3><p>调整弹幕字号</p></div>
            <div class="range-control"><input v-model.number="form.danmakuFontSize" type="range" min="16" max="48" step="2" :style="{ '--range-fill': ((form.danmakuFontSize - 16) / 32 * 100) + '%' }" aria-label="弹幕字号" /><span>{{ form.danmakuFontSize }}<small>px</small></span></div>
          </div>

          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="position" /><div class="setting-copy"><h3>显示位置</h3><p>横向移动时选择区域；纵向移动时按列排列</p></div>
            <div class="segmented" role="group" aria-label="弹幕位置"><button v-for="position in positions" :key="position.value" type="button" :class="{ selected: form.danmakuPosition === position.value }" :aria-pressed="form.danmakuPosition === position.value" @click="form.danmakuPosition = position.value">{{ position.label }}</button></div>
          </div>

          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="clock" /><div class="setting-copy"><h3>显示时长</h3><p>1–30 秒，到时直接消失，不改变移动速度</p></div>
            <div class="duration-control"><input v-model.number="form.danmakuDuration" type="number" min="1" max="30" step="1" class="field duration-field" aria-label="弹幕显示时长" /><span>秒</span></div>
          </div>

          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="speed" /><div class="setting-copy"><h3>移动速度</h3><p>每秒移动的距离，与显示时长独立</p></div>
            <div class="duration-control"><input v-model.number="form.danmakuSpeed" type="number" min="30" max="600" step="1" class="field speed-field" aria-label="弹幕移动速度" /><span>px/s</span></div>
          </div>

          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="direction" /><div class="setting-copy"><h3>移动方向</h3><p>选择弹幕进入和移动的方向</p></div>
            <select v-model="form.danmakuDirection" class="field direction-field" aria-label="弹幕移动方向"><option v-for="direction in directions" :key="direction.value" :value="direction.value">{{ direction.label }}</option></select>
          </div>

          <div class="preview-heading"><span>文字效果预览</span><span>{{ form.danmakuSpeed }} px/s · {{ form.danmakuDuration }} 秒后消失</span></div>
          <div class="preview-canvas" aria-label="弹幕效果预览">
            <span class="preview-screen"><SettingsIcon name="monitor" />主屏幕</span>
            <div class="preview-message" :class="form.danmakuPosition"><span :style="{ color: validColor ? form.danmakuColor : '#ffffff', fontSize: form.danmakuFontSize + 'px' }">让交流飘过桌面</span><small>{{ form.nickname || '你的昵称' }}</small></div>
            <span class="preview-decoration"></span>
          </div>
        </section>

        <section v-else-if="activeSection === 'keyboard'" class="section-stack" aria-label="快捷键">
          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="keyboard" /><div class="setting-copy"><h3>唤起输入框</h3><p>在任何应用中快速发送弹幕</p></div>
            <button type="button" class="hotkey-control" :class="{ recording: hotkeyFocus }" aria-label="修改弹幕快捷键，聚焦后按下新组合键" @focus="hotkeyFocus = true" @blur="hotkeyFocus = false" @keydown="onHotkeyKey">
              <span v-if="hotkeyFocus" class="recording-label">按下新的组合键…</span><template v-else><kbd v-for="(key, index) in hotkeyLabels" :key="index">{{ key }}</kbd><SettingsIcon name="keyboard" /></template>
            </button>
          </div>
          <div class="info-note"><SettingsIcon name="keyboard" /><div><strong>设置方式</strong><p>点击右侧快捷键，直接按下新组合键。支持 Ctrl、Alt、Shift、Win 和 F 功能键；按 Tab 离开录入，按 Esc 取消焦点。</p><p>输入弹幕后按 Enter 发送，按 Esc 关闭输入框。</p></div></div>
        </section>

        <section v-else-if="activeSection === 'room'" class="section-stack" aria-label="房间与连接">
          <div class="setting-card setting-row"><SettingsIcon class="row-icon" name="user" /><div class="setting-copy"><h3>你的昵称</h3><p>显示在发送的弹幕下方</p></div><input v-model="form.nickname" class="field row-field" maxlength="20" placeholder="输入昵称" aria-label="昵称" /></div>
          <div class="setting-card setting-row"><SettingsIcon class="row-icon" name="room" /><div class="setting-copy"><h3>房间号</h3><p>使用相同房间号即可互相发现</p></div><input v-model="form.roomCode" class="field row-field room-field" maxlength="8" placeholder="3–8 位字母或数字" aria-label="房间号" spellcheck="false" /></div>
          <div class="setting-card address-card"><SettingsIcon class="row-icon" name="wifi" /><div class="setting-body"><h3>本机 IP 地址</h3><p>将共同局域网内的地址提供给朋友</p><div class="address-list"><span v-for="address in network.addresses" :key="address" class="address-chip">{{ address }}</span><span v-if="!network.addresses.length" class="muted">未找到可用网卡</span></div><p class="network-detail">在线 {{ network.memberCount }} 人（包含自己）<span v-if="network.error" class="network-error"> · {{ network.error }}</span></p></div></div>
          <div class="setting-card setting-row"><SettingsIcon class="row-icon" name="link" /><div class="setting-copy"><h3>IP 直连</h3><p>自动发现失败时填写，留空则自动发现</p></div><input v-model="form.peerAddress" class="field row-field" maxlength="15" placeholder="对方的局域网 IP（选填）" aria-label="对方 IP" spellcheck="false" /></div>
          <div class="info-note"><SettingsIcon name="shield" /><div><strong>连接不上？</strong><p>请确认双方房间号一致，并连接同一局域网。多网卡设备请选择共同网络的 IP。仍无法连接时，双方运行程序目录中的“放行防火墙.bat”。</p></div></div>
        </section>

        <section v-else class="section-stack" aria-label="应用">
          <div class="setting-card setting-row">
            <SettingsIcon class="row-icon" name="power" /><div class="setting-copy"><h3>开机自启动</h3><p>登录 Windows 后自动启动，在托盘中运行</p></div>
            <div class="switch-control"><span>{{ startupBusy ? '正在更新…' : startup.enabled ? '开' : '关' }}</span><button type="button" class="toggle-switch" :class="{ enabled: startup.enabled }" role="switch" :aria-checked="startup.enabled" aria-label="开机自启动" :disabled="!startupLoaded || !startup.supported || startupBusy" @click="toggleStartup"><span></span></button></div>
          </div>
          <p v-if="startup.error" class="startup-error" role="alert">{{ startup.error }}</p>
          <div class="info-note"><SettingsIcon name="power" /><div><strong>开关即时生效</strong><p>开启后，下次登录 Windows 会自动启动房间弹幕。关闭后不再自动启动。</p><p>免安装版移动文件夹后，请重新开启此开关，以更新启动位置。</p></div></div>
        </section>
      </div>

      <footer class="save-bar">
        <div class="save-feedback" role="status" aria-live="polite"><span v-if="activeSection === 'application'">此页面的开关即时生效</span><span v-else-if="status" :class="{ error: statusError, success: !statusError }">{{ status }}</span><span v-else>修改后点击保存，即可应用设置</span></div>
        <button v-if="activeSection !== 'application'" type="button" class="save-button" :disabled="!loaded || saving" @click="save"><SettingsIcon name="save" />{{ saving ? '正在保存…' : '保存设置' }}</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.settings-shell { display: grid; grid-template-columns: 216px minmax(0, 1fr); width: 100%; height: 100%; background: #f1f5f9; }
.sidebar { display: flex; flex-direction: column; min-width: 0; padding: 28px 14px 20px; border-right: 1px solid #e5eaf0; }
.brand { display: flex; gap: 12px; align-items: center; padding: 0 12px 37px; }
.brand-mark { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; color: #fff; border-radius: 12px; background: #1476d4; box-shadow: 0 4px 12px #1476d41a; }
.brand strong { display: block; font-size: 18px; letter-spacing: .3px; }
.brand div > span { display: block; margin-top: 4px; font-size: 11px; color: #8290a2; }
.nav-caption { padding: 0 14px; margin-bottom: 11px; color: #94a0af; font-size: 11px; letter-spacing: 1.5px; }
nav { display: flex; flex-direction: column; gap: 6px; }
.nav-item { position: relative; display: flex; align-items: center; gap: 13px; width: 100%; padding: 14px 16px; border: 0; border-radius: 7px; background: transparent; color: #536174; text-align: left; font-size: 14px; }
.nav-item:hover { background: #e8edf3; }
.nav-item.active { background: #e3ebf5; color: #126ac0; font-weight: 600; }
.nav-item.active::before { content: ''; position: absolute; left: 0; top: 16px; bottom: 16px; width: 3px; background: #1476d4; border-radius: 3px; }
.nav-item svg { width: 21px; height: 21px; flex-shrink: 0; }
.sidebar-foot { display: flex; align-items: center; gap: 9px; padding: 16px 12px 0; margin-top: auto; color: #8190a3; font-size: 11px; }
.sidebar-foot svg { width: 17px; height: 17px; }
.workspace { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.content-scroll { flex: 1; min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 30px 36px 28px; scrollbar-gutter: stable; }
.eyebrow { color: #8a96a6; font-size: 11px; letter-spacing: .5px; margin-bottom: 7px; }
h1 { margin: 0; font-size: 30px; line-height: 1.4; font-weight: 650; letter-spacing: 1px; }
.page-header { margin-bottom: 24px; }
.connection-banner { display: flex; align-items: center; gap: 14px; padding: 20px 22px; margin-bottom: 30px; background: #fff; border: 1px solid #e5eaf0; border-radius: 9px; }
.status-dot { width: 10px; height: 10px; flex-shrink: 0; border-radius: 50%; background: #e5a448; }
.status-dot.online { background: #55b978; box-shadow: 0 0 0 5px #55b97812; }
.banner-copy { flex: 1; min-width: 0; }
.banner-copy strong { font-size: 16px; font-weight: 600; }
.banner-copy p { margin: 5px 0 0; font-size: 11px; color: #8a96a5; line-height: 1.6; }
.online-badge { flex-shrink: 0; font-size: 11px; color: #45745c; background: #edf7f0; border: 1px solid #dceee2; padding: 6px 10px; border-radius: 6px; }
.section-heading { margin-bottom: 17px; }
h2 { margin: 0; font-size: 17px; font-weight: 600; }
.section-heading p { margin: 7px 0 0; color: #8a96a5; font-size: 12px; line-height: 1.6; }
.section-stack { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.setting-card { display: flex; align-items: flex-start; gap: 17px; min-width: 0; padding: 21px 22px; background: #fff; border: 1px solid #e5eaf0; border-radius: 8px; }
.row-icon { width: 23px; height: 23px; margin-top: 1px; flex-shrink: 0; color: #576578; }
h3 { margin: 0; font-size: 14px; font-weight: 500; line-height: 1.7; }
.setting-card p { margin: 3px 0 0; color: #8a96a5; font-size: 11px; line-height: 1.7; }
.setting-body, .setting-copy { min-width: 0; }
.setting-body { flex: 1; }
.setting-row { display: grid; grid-template-columns: 23px minmax(0, 1fr) minmax(180px, 260px); align-items: center; }
.setting-row .row-icon { margin-top: 0; }
.field { display: block; width: 100%; min-width: 0; height: 37px; padding: 0 11px; border: 1px solid #d5dce5; border-radius: 5px; outline: 0; color: #344256; background: #fff; transition: border-color .15s, box-shadow .15s; }
.field::placeholder { color: #a0aab7; font-size: 11px; }
.field:focus { border-color: #1476d4; box-shadow: 0 0 0 3px #1476d412; }
.color-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 16px; min-width: 0; }
.swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; min-width: 0; }
.swatch { display: grid; place-items: center; width: 27px; height: 27px; padding: 0; flex-shrink: 0; border-radius: 50%; border: 1px solid #00000016; transition: box-shadow .15s; }
.swatch.selected { outline: 2px solid #1476d4; outline-offset: 3px; }
.swatch svg { width: 15px; height: 15px; stroke-width: 2.5; }
.hex-field { width: 96px; height: 33px; font-family: Consolas, monospace; font-size: 12px; }
.range-control { display: flex; align-items: center; gap: 22px; min-width: 0; }
.range-control input { appearance: none; -webkit-appearance: none; flex: 1; width: 100%; min-width: 0; height: 4px; border-radius: 4px; background: linear-gradient(to right, #1476d4 0 var(--range-fill), #dce3eb var(--range-fill) 100%); cursor: pointer; }
.range-control input::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; background: #1476d4; box-shadow: 0 0 0 1px #cbd8e6, 0 1px 4px #1d466922; }
.range-control > span { min-width: 44px; text-align: right; font-size: 14px; font-variant-numeric: tabular-nums; }
.range-control small { margin-left: 5px; font-size: 11px; color: #8a96a5; }
.duration-control { display: flex; align-items: center; justify-content: flex-end; gap: 10px; color: #8390a1; font-size: 12px; }
.duration-field { width: 90px; font-variant-numeric: tabular-nums; }
.speed-field { width: 90px; font-variant-numeric: tabular-nums; }
.switch-control { display: flex; align-items: center; justify-content: flex-end; gap: 13px; color: #63768c; font-size: 12px; }
.toggle-switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; padding: 2px; border: 1px solid #9aa6b5; border-radius: 14px; background: #fff; transition: background .15s, border-color .15s; }
.toggle-switch > span { display: block; width: 18px; height: 18px; border-radius: 50%; background: #7b8797; transition: transform .15s, background .15s; }
.toggle-switch.enabled { border-color: #1476d4; background: #1476d4; }.toggle-switch.enabled > span { background: #fff; transform: translateX(19px); }
.toggle-switch:disabled { opacity: .5; cursor: default; }.startup-error { margin: 6px 0; color: #c44d43; font-size: 12px; line-height: 1.7; }
.direction-field { font-size: 12px; cursor: pointer; }
.segmented { display: flex; min-width: 0; border: 1px solid #dce3eb; padding: 3px; border-radius: 6px; background: #f7f9fc; }
.segmented button { flex: 1; min-width: 0; padding: 6px 4px; border: 0; border-radius: 4px; background: transparent; color: #8390a1; font-size: 12px; }
.segmented button.selected { background: #fff; color: #1476d4; box-shadow: 0 1px 4px #243b5314; font-weight: 600; }
.preview-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin-top: 14px; margin-bottom: 2px; color: #5f6e81; font-size: 12px; }
.preview-heading span + span { color: #98a3b0; font-size: 11px; }
.preview-canvas { position: relative; height: 168px; flex-shrink: 0; overflow: hidden; border-radius: 9px; background: #28364b; border: 1px solid #233248; }
.preview-screen { position: absolute; top: 13px; left: 15px; display: flex; align-items: center; gap: 6px; font-size: 10px; color: #a4b1c4; }
.preview-screen svg { width: 13px; height: 13px; }
.preview-message { position: absolute; left: 22%; width: max-content; max-width: calc(78% - 12px); display: flex; flex-direction: column; align-items: center; gap: 3px; overflow: hidden; }
.preview-message.top { top: 39px; }.preview-message.middle { top: 50%; transform: translateY(-50%); }.preview-message.bottom { bottom: 18px; }
.preview-message > span { white-space: nowrap; line-height: 1.25; font-weight: 600; text-shadow: 0 1px 4px #0008; }
.preview-message small { color: #f5d689; font-size: 11px; text-shadow: 0 1px 3px #0006; }
.preview-decoration { position: absolute; right: 16px; bottom: 11px; width: 25px; height: 3px; border-radius: 3px; background: #70819855; }
.hotkey-control { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 5px; min-height: 41px; padding: 6px 9px; border: 1px solid #d5dce5; border-radius: 5px; background: #fff; }
kbd { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #1476d4; color: #fff; font: 600 12px 'Segoe UI', sans-serif; }
.hotkey-control > svg { width: 19px; height: 19px; margin-left: auto; color: #7a899b; }
.hotkey-control.recording { border-color: #1476d4; background: #f4f9ff; justify-content: center; }
.recording-label { color: #1476d4; font-size: 12px; }
.info-note { display: flex; align-items: flex-start; gap: 12px; padding: 17px 18px; margin-top: 10px; border: 1px solid #e0e8f1; border-radius: 8px; color: #63768c; background: #eaf0f7; }
.info-note svg { width: 20px; height: 20px; flex-shrink: 0; }
.info-note strong { font-size: 12px; font-weight: 500; }
.info-note p { margin: 6px 0 0; font-size: 11px; line-height: 1.9; color: #8390a1; }
.room-field { text-transform: uppercase; font-family: Consolas, 'Microsoft YaHei', monospace; letter-spacing: 1px; }
.address-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.address-chip { padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 4px; background: #f5f7fb; color: #5d7087; font: 11px Consolas, monospace; user-select: text; }
.setting-card .network-detail { margin-top: 12px; }.network-error { color: #c06847; }
.muted { color: #94a0af; font-size: 12px; }
.save-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-shrink: 0; min-height: 71px; padding: 16px 36px; border-top: 1px solid #e0e6ee; background: #f7f9fc; }
.save-feedback { min-width: 0; color: #94a0af; font-size: 11px; line-height: 1.7; }
.save-feedback .error { color: #c44d43; }.save-feedback .success { color: #368659; }
.save-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; min-width: 120px; height: 38px; padding: 0 17px; border: 1px solid #116bc1; border-radius: 5px; color: #fff; background: #1476d4; font-size: 12px; box-shadow: 0 2px 3px #0f5c9c12; }
.save-button:hover { background: #1069c0; }.save-button:disabled { opacity: .55; cursor: default; }
.save-button svg { width: 16px; height: 16px; }
@media (max-width: 860px) {
  .settings-shell { grid-template-columns: 182px minmax(0, 1fr); }
  .brand { padding-left: 4px; gap: 9px; }.brand-mark { width: 34px; height: 34px; }.brand strong { font-size: 16px; }
  .nav-item { padding-left: 12px; gap: 9px; font-size: 13px; }
  .content-scroll { padding: 24px 24px; }.save-bar { padding: 15px 24px; }
  .setting-row { grid-template-columns: 23px minmax(0, 1fr); gap: 12px; }
  .setting-row > :last-child { grid-column: 2; width: 100%; }
  .connection-banner { padding: 17px; gap: 10px; }.banner-copy p { font-size: 10px; }
}
@media (max-width: 600px) {
  .settings-shell { grid-template-columns: 64px minmax(0, 1fr); }.sidebar { padding: 20px 7px; }
  .brand { justify-content: center; padding: 0 0 30px; }.brand div, .nav-caption, .nav-item span, .sidebar-foot { display: none; }
  .nav-item { justify-content: center; padding: 15px 0; }.content-scroll { padding: 20px 16px; }.save-bar { padding: 14px 16px; }
  .setting-card { padding: 17px 15px; gap: 12px; }.connection-banner { flex-wrap: wrap; }.online-badge { margin-left: 20px; }
  .save-button { min-width: 105px; }.preview-message { left: 12%; }
}
</style>
