import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, Notification, type NativeImage } from 'electron'
import path from 'node:path'
import { isIPv4 } from 'node:net'
import { RoomManager, type InputMode, type DanmakuPosition, type DanmakuDirection, type DanmakuStyle } from './roomManager'
import { LanTransport } from './lanTransport'
import { StartupManager } from './startupManager'

const startup = new StartupManager()

let room: RoomManager
let transport: LanTransport
let inputWin: BrowserWindow | null = null
let inputShownAt = 0
// 待应用/当前输入模式：页面加载完成后补发，避免首次打开时 set-mode 消息丢失
let inputMode: InputMode = 'dm'
let settingsWin: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const HOTKEY_DEFAULT = 'CommandOrControl+Shift+Enter'

// 当前主屏弹幕样式
let styleState: DanmakuStyle = {
  danmakuColor: '#ffffff',
  danmakuFontSize: 26,
  danmakuPosition: 'top',
  danmakuDuration: 9,
  danmakuSpeed: 160,
  danmakuDirection: 'right-to-left'
}

// 调试日志：写入 userData/debug.log，便于排查热键/窗口问题
function dbg(msg: string): void {
  try {
    const fs = require('node:fs')
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), `${new Date().toISOString()} ${msg}\n`, 'utf-8')
  } catch {
    // 忽略日志失败
  }
}

function loadRenderer(win: BrowserWindow, name: 'input' | 'overlay' | 'settings'): void {
  const base = process.env['ELECTRON_RENDERER_URL']
  if (base) {
    win.loadURL(`${base}/${name}.html`)
  } else {
    win.loadFile(path.join(__dirname, '../renderer', `${name}.html`))
  }
}

// ---------- 输入窗口 ----------

function createInputWindow(): void {
  if (inputWin && !inputWin.isDestroyed()) {
    showInputWindow()
    return
  }
  inputWin = new BrowserWindow({
    width: 400,
    height: 88,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  loadRenderer(inputWin, 'input')
  inputWin.webContents.on('did-finish-load', () => {
    inputWin?.webContents.send('input:set-mode', inputMode)
  })
  inputWin.on('blur', () => {
    // 失焦不自动隐藏：托盘菜单关闭时窗口短暂失焦，隐藏会导致用户还没按回车窗口就消失
    dbg(`input blur (${Date.now() - inputShownAt}ms after show) -> keep open`)
  })
  inputWin.on('closed', () => {
    inputWin = null
  })
}

function showInputWindow(mode: InputMode = 'dm'): void {
  dbg(`showInputWindow mode=${mode}`)
  inputMode = mode
  if (!inputWin) createInputWindow()
  if (!inputWin) return
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const wa = display.workArea
  const x = Math.round(wa.x + wa.width / 2 - 200)
  const y = Math.round(wa.y + wa.height - 110)
  inputWin.setPosition(x, y)
  inputShownAt = Date.now()
  inputWin.show()
  inputWin.focus()
  // 先显示再发模式，确保渲染进程已就绪
  inputWin.webContents.send('input:set-mode', mode)
}

function hideInput(reason = ''): void {
  if (inputWin && !inputWin.isDestroyed() && inputWin.isVisible()) {
    dbg(`hideInput ${reason}`.trim())
    inputWin.hide()
  }
}

// ---------- 设置窗口 ----------

function createSettingsWindow(): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  settingsWin = new BrowserWindow({
    title: '房间弹幕 · 设置',
    width: Math.min(1040, workArea.width),
    height: Math.min(760, workArea.height),
    minWidth: Math.min(700, workArea.width),
    minHeight: Math.min(480, workArea.height),
    show: false,
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    resizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  loadRenderer(settingsWin, 'settings')
  settingsWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      settingsWin?.hide()
    }
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
}

function showSettingsWindow(): void {
  dbg('showSettingsWindow')
  if (!settingsWin) createSettingsWindow()
  if (!settingsWin) return
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const wa = display.workArea
  const bounds = settingsWin.getBounds()
  const width = Math.min(bounds.width, wa.width)
  const height = Math.min(bounds.height, wa.height)
  settingsWin.setSize(width, height)
  const x = Math.round(wa.x + (wa.width - width) / 2)
  const y = Math.round(wa.y + (wa.height - height) / 2)
  settingsWin.setPosition(x, y)
  settingsWin.show()
  settingsWin.focus()
}

// ---------- 弹幕 Overlay ----------

function createOverlay(): void {
  // 始终只创建主屏弹幕层，主屏不一定是显示器列表中的第一项。
  const display = screen.getPrimaryDisplay()
  const bounds = display.bounds
  if (overlayWin && !overlayWin.isDestroyed()) {
    const current = overlayWin.getBounds()
    if (current.x === bounds.x && current.y === bounds.y &&
      current.width === bounds.width && current.height === bounds.height) return
    overlayWin.destroy()
  }
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  overlayWin = win
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('overlay:style', styleState)
  })
  loadRenderer(win, 'overlay')
  dbg(`primary overlay created display=${display.id} bounds=${JSON.stringify(bounds)}`)
}

function showDanmaku(payload: { text: string; name: string }): void {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay:dm', payload)
}

function broadcastStyle(): void {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay:style', styleState)
}

function syncStyleState(): void {
  styleState = {
    danmakuColor: room.settings.danmakuColor,
    danmakuFontSize: room.settings.danmakuFontSize,
    danmakuPosition: room.settings.danmakuPosition,
    danmakuDuration: room.settings.danmakuDuration,
    danmakuSpeed: room.settings.danmakuSpeed,
    danmakuDirection: room.settings.danmakuDirection
  }
}

// ---------- 托盘 ----------

function makeIcon(): NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = 14
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2)
      const i = (y * size + x) * 4
      if (dist <= r) {
        // 圆底：深蓝
        buf[i] = 0x80 // B
        buf[i + 1] = 0x5a // G
        buf[i + 2] = 0x2b // R
        buf[i + 3] = 255
        // 两道白色斜纹（示意弹幕横条）
        if ((x + y) % 9 < 3 && dist <= r - 3) {
          buf[i] = 255
          buf[i + 1] = 255
          buf[i + 2] = 255
        }
      } else {
        buf[i + 3] = 0
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function buildTrayMenu(): void {
  if (!tray) return
  const n = transport.memberCount
  const menu = Menu.buildFromTemplate([
    { label: `房间号：${room.settings.roomCode}`, enabled: false },
    { label: `昵称：${room.settings.nickname}`, enabled: false },
    { label: `在线成员：${n} 人`, enabled: false },
    { label: transport.getNetworkInfo().error || '局域网连接：设置中可查看 IP / 直连', enabled: false },
    { type: 'separator' },
    { label: '设置…', click: () => showSettingsWindow() },
    { label: '修改昵称…', click: () => showInputWindow('nick') },
    { label: '修改房间号…', click: () => showInputWindow('room') },
    { label: '发一条弹幕测试', click: () => showInputWindow('dm') },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

function createTray(): void {
  tray = new Tray(makeIcon())
  tray.setToolTip(`房间弹幕 · ${room.settings.roomCode}`)
  tray.on('click', () => showInputWindow('dm'))
  buildTrayMenu()
}

function refreshTray(): void {
  buildTrayMenu()
}

// ---------- 热键 ----------

function hotkeyAction(): void {
  dbg(`hotkey triggered: ${room.settings.hotkey}`)
  showInputWindow('dm')
}

function registerHotkey(): void {
  const hotkey = room.settings.hotkey || HOTKEY_DEFAULT
  const ok = globalShortcut.register(hotkey, hotkeyAction)
  dbg(`register hotkey ${hotkey} => ${ok}`)
  if (!ok) {
    new Notification({ title: '房间弹幕', body: `热键 ${hotkey} 注册失败（可能被其他程序占用），可在设置中更换。` }).show()
  }
}

// ---------- IPC ----------

function setupIpc(): void {
  ipcMain.on('input:send', (_e, text: unknown) => {
    const clean = String(text ?? '').trim().slice(0, 200)
    if (!clean) return
    showDanmaku({ name: room.settings.nickname, text: clean })
    transport.sendDm(clean)
  })

  ipcMain.on('input:close', () => hideInput())

  ipcMain.on('input:save', (_e, field: unknown, value: unknown) => {
    const f = String(field)
    const v = String(value ?? '').trim()
    dbg(`input:save field=${f} value=${v}`)
    if (f === 'nickname' || f === 'nick') {
      if (v && v.length <= 20) {
        room.setNickname(v)
        refreshTray()
        dbg('nickname saved')
      } else {
        dbg('nickname rejected')
      }
    } else if (f === 'roomCode' || f === 'room') {
      const code = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
      if (code.length >= 3) {
        room.setRoomCode(code)
        transport.restart(code)
        refreshTray()
        dbg(`roomCode saved -> ${code}`)
        new Notification({ title: '房间弹幕', body: `房间号已修改为 ${code}` }).show()
      } else {
        dbg(`roomCode rejected (len=${code.length})`)
      }
    }
    hideInput('after-save')
  })

  ipcMain.handle('input:init', () => ({
    nickname: room.settings.nickname,
    roomCode: room.settings.roomCode,
    hotkey: room.settings.hotkey || HOTKEY_DEFAULT,
    memberCount: transport.memberCount,
    mode: inputMode
  }))

  ipcMain.on('settings:close', () => {
    settingsWin?.hide()
  })

  ipcMain.handle('network:info', () => transport.getNetworkInfo())
  ipcMain.handle('startup:status', () => startup.getStatus())
  ipcMain.handle('startup:set', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('开机自启动状态必须为布尔值')
    return startup.setEnabled(enabled)
  })

  ipcMain.handle('settings:init', () => ({
    nickname: room.settings.nickname,
    roomCode: room.settings.roomCode,
    peerAddress: room.settings.peerAddress,
    hotkey: room.settings.hotkey || HOTKEY_DEFAULT,
    danmakuColor: room.settings.danmakuColor,
    danmakuFontSize: room.settings.danmakuFontSize,
    danmakuPosition: room.settings.danmakuPosition,
    danmakuDuration: room.settings.danmakuDuration,
    danmakuSpeed: room.settings.danmakuSpeed,
    danmakuDirection: room.settings.danmakuDirection
  }))

  const HOTKEY_RE = /^(?:(?:CommandOrControl|Ctrl|Alt|Shift|Super)\+)*(?:F(?:[1-9]|1\d|2[0-4])|[A-Z0-9]|Space|Enter|Escape|Tab|Up|Down|Left|Right)$/

  ipcMain.on('settings:save', (e, patch: unknown) => {
    const p = (patch ?? {}) as Record<string, unknown>
    let error = ''
    if (p.roomCode !== undefined) {
      const code = String(p.roomCode).trim().toUpperCase()
      if (/^[A-Z0-9]{3,8}$/.test(code)) {
        if (code !== room.settings.roomCode) {
          room.setRoomCode(code)
          transport.restart(code)
          refreshTray()
        }
      } else {
        error = '房间号需为 3–8 位字母或数字'
      }
    }
    if (p.peerAddress !== undefined) {
      const address = String(p.peerAddress).trim()
      if (!address || (isIPv4(address) && !['0.0.0.0', '255.255.255.255'].includes(address))) {
        room.setPeerAddress(address)
        transport.refresh()
      } else {
        error = '请输入有效的对方 IPv4 地址，或留空使用自动发现'
      }
    }
    if (p.nickname !== undefined) {
      const v = String(p.nickname).trim()
      if (v && v.length <= 20) {
        room.setNickname(v)
        refreshTray()
      } else {
        error = '昵称需为 1-20 个字符'
      }
    }
    if (p.hotkey !== undefined) {
      const hk = String(p.hotkey).trim()
      if (hk && HOTKEY_RE.test(hk)) {
        const old = room.settings.hotkey || HOTKEY_DEFAULT
        if (old !== hk) {
          globalShortcut.unregister(old)
          const ok = globalShortcut.register(hk, hotkeyAction)
          if (ok) {
            room.setHotkey(hk)
            refreshTray()
            dbg(`hotkey changed to ${hk}`)
          } else {
            globalShortcut.register(old, hotkeyAction)
            error = `热键 ${hk} 注册失败（可能被占用），已恢复原热键`
          }
        }
      } else {
        error = '快捷键格式不正确'
      }
    }
    if (p.danmakuColor !== undefined || p.danmakuFontSize !== undefined || p.danmakuPosition !== undefined || p.danmakuDuration !== undefined || p.danmakuSpeed !== undefined || p.danmakuDirection !== undefined) {
      const color = typeof p.danmakuColor === 'string' && p.danmakuColor ? p.danmakuColor : undefined
      const fsRaw = p.danmakuFontSize
      const fontSize = typeof fsRaw === 'number' ? Math.min(48, Math.max(14, Math.round(fsRaw))) : undefined
      const posRaw = String(p.danmakuPosition ?? '')
      const pos: DanmakuPosition | undefined = ['top', 'middle', 'bottom'].includes(posRaw) ? (posRaw as DanmakuPosition) : undefined
      const durationRaw = p.danmakuDuration
      const duration = typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw >= 1 && durationRaw <= 30 ? Math.round(durationRaw) : undefined
      if (durationRaw !== undefined && duration === undefined) error = '显示时长需为 1–30 秒'
      const speedRaw = p.danmakuSpeed
      const speed = typeof speedRaw === 'number' && Number.isFinite(speedRaw) && speedRaw >= 30 && speedRaw <= 600 ? Math.round(speedRaw) : undefined
      if (speedRaw !== undefined && speed === undefined) error = '移动速度需为 30–600 px/s'
      const directions: DanmakuDirection[] = ['right-to-left', 'left-to-right', 'bottom-to-top', 'top-to-bottom']
      const direction = directions.includes(p.danmakuDirection as DanmakuDirection) ? p.danmakuDirection as DanmakuDirection : undefined
      if (p.danmakuDirection !== undefined && direction === undefined) error = '请选择有效的移动方向'
      room.setDanmakuStyle({ danmakuColor: color, danmakuFontSize: fontSize, danmakuPosition: pos, danmakuDuration: duration, danmakuSpeed: speed, danmakuDirection: direction })
      syncStyleState()
      broadcastStyle()
    }
    e.sender.send('settings:save-result', { ok: !error, error })
  })
}

// ---------- 生命周期 ----------

async function init(): Promise<void> {
  room = new RoomManager()
  transport = new LanTransport(room)

  transport.onDm = (m) => {
    dbg(`dm rx name=${m.name} len=${m.text.length}`)
    showDanmaku(m)
  }
  transport.onHello = (from, roomCode) => {
    dbg(`hello rx from=${from} room=${roomCode} members=${transport.members.size}`)
  }
  transport.onStatus = (info) => {
    if (info.error) dbg(`lan error: ${info.error}`)
    refreshTray()
  }
  transport.onMembers = (count) => {
    refreshTray()
    dbg(`members updated -> ${count}`)
    if (inputWin && !inputWin.isDestroyed()) inputWin.webContents.send('room:info', { memberCount: count })
  }

  transport.start()
  dbg(`init done. room=${room.settings.roomCode} nickname=${room.settings.nickname} hotkey=${room.settings.hotkey}`)
  setupIpc()
  syncStyleState()
  createOverlay()
  createTray()
  registerHotkey()

  screen.on('display-added', createOverlay)
  screen.on('display-removed', createOverlay)
  screen.on('display-metrics-changed', createOverlay)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!argv.includes('--autostart')) showInputWindow('dm')
  })
  app.whenReady().then(init)

  app.on('before-quit', () => {
    quitting = true
    transport?.stop()
    globalShortcut.unregisterAll()
  })

  // 常驻托盘，关闭所有窗口不退出
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })
}
