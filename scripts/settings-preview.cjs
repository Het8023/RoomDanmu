// Render the built settings UI with in-memory IPC data; never changes user settings.
// Run using Electron: electron.exe scripts/settings-preview.cjs
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'artifacts', 'settings-preview')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lan-settings-qa-'))
app.setPath('userData', profile)
app.disableHardwareAcceleration()
const settings = { nickname: 'het', roomCode: '111', peerAddress: '', hotkey: 'Alt+C', danmakuColor: '#4dabff', danmakuFontSize: 26, danmakuPosition: 'top', danmakuDuration: 9, danmakuSpeed: 160, danmakuDirection: 'right-to-left' }
const network = { ready: true, error: '', addresses: ['192.168.20.56', '172.23.106.147', '192.168.190.1', '192.168.100.1', '172.20.10.2'], memberCount: 1 }
const saved = []
let closeCalls = 0
let startupState = { supported: true, enabled: false, error: '' }
const startupChanges = []
let failStartup = false
ipcMain.handle('settings:init', () => settings)
ipcMain.handle('network:info', () => network)
ipcMain.handle('startup:status', () => startupState)
ipcMain.handle('startup:set', (_event, enabled) => {
  startupChanges.push(enabled)
  startupState = failStartup ? { ...startupState, error: '测试：系统拒绝更新启动项' } : { ...startupState, enabled, error: '' }
  return startupState
})
ipcMain.on('settings:save', (event, patch) => {
  saved.push(patch)
  event.sender.send('settings:save-result', { ok: true, error: '' })
})
ipcMain.on('settings:close', () => { closeCalls += 1 })

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ width: 1040, height: 720, show: false, frame: false,
    webPreferences: { preload: path.join(project, 'out/preload/index.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true }
  })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.error(message) })
  await win.loadFile(path.join(project, 'out/renderer/settings.html'))
  async function settle() { await new Promise((resolve) => setTimeout(resolve, 180)) }
  await settle()
  const metrics = []
  for (const [width, height, zoom] of [[1040, 720, 1], [700, 600, 1], [1040, 720, 1.5], [500, 600, 1]]) {
    win.setSize(width, height)
    win.webContents.setZoomFactor(zoom)
    await settle()
    for (const [index, section] of ['appearance', 'keyboard', 'room', 'application'].entries()) {
      await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[${index}].click()`)
      await settle()
      const result = await win.webContents.executeJavaScript(`(() => {
        const selectors = ['html', 'body', '#app', '.settings-shell', '.workspace', '.content-scroll', '.save-bar', '.setting-card', '.swatches', '.color-controls', '.address-list'];
        const overflow = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ selector, width: element.clientWidth, scrollWidth: element.scrollWidth })));
        const button = document.querySelector('.save-button')?.getBoundingClientRect() || document.querySelector('.save-bar').getBoundingClientRect();
        return { viewport: [innerWidth, innerHeight], overflow, saveVisible: button.bottom <= innerHeight + 1 && button.right <= innerWidth + 1, section: document.querySelector('h2').textContent };
      })()`)
      metrics.push({ width, height, zoom, section, ...result })
      assert.deepEqual(result.overflow, [], JSON.stringify(metrics.at(-1)))
      assert.equal(result.saveVisible, true, JSON.stringify(metrics.at(-1)))
      if (zoom === 1 && (width === 1040 || width === 700)) {
        fs.writeFileSync(path.join(output, `${section}-${width}.png`), (await win.webContents.capturePage()).toPNG())
      }
    }
  }
  win.setSize(1040, 720)
  win.webContents.setZoomFactor(1)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[0].click()`)
  await settle()
  await win.webContents.executeJavaScript(`document.querySelectorAll('.swatch')[2].click(); document.querySelectorAll('.segmented button')[2].click();`)
  await settle()
  await win.webContents.executeJavaScript(`(() => { const input = document.querySelector('.duration-field'); input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await win.webContents.executeJavaScript(`(() => { const input = document.querySelector('.speed-field'); input.value = '240'; input.dispatchEvent(new Event('input', { bubbles: true })); const direction = document.querySelector('.direction-field'); direction.value = 'bottom-to-top'; direction.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  await settle()
  await win.webContents.executeJavaScript(`document.querySelector('.save-button').click()`)
  await settle()
  assert.equal(saved[0].danmakuColor, '#ff6b6b')
  assert.equal(saved[0].danmakuPosition, 'bottom')
  assert.equal(saved[0].roomCode, '111')
  assert.equal(saved[0].danmakuDuration, 3)
  assert.equal(saved[0].danmakuSpeed, 240)
  assert.equal(saved[0].danmakuDirection, 'bottom-to-top')
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.save-feedback').textContent`), '设置已保存')
  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[1].click()`)
  await settle()
  await win.webContents.executeJavaScript(`(() => { const button = document.querySelector('.hotkey-control'); button.focus(); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true })); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`)
  await settle()
  assert.equal(closeCalls, 0, 'Esc during hotkey capture must only leave capture mode')
  await win.webContents.executeJavaScript(`document.querySelector('.save-button').click()`)
  await settle()
  assert.equal(saved[1].hotkey, 'CommandOrControl+Shift+Enter')
  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[2].click()`)
  await settle()
  await win.webContents.executeJavaScript(`(() => { const input = document.querySelector('.room-field'); input.value = 'abc234'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await settle()
  await win.webContents.executeJavaScript(`document.querySelector('.save-button').click()`)
  await settle()
  assert.equal(saved[2].roomCode, 'ABC234')
  await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-item')[3].click()`)
  await settle()
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`), 'false')
  await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').click()`)
  await settle()
  assert.equal(startupState.enabled, true)
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`), 'true')
  await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').click()`)
  await settle()
  assert.equal(startupState.enabled, false)
  failStartup = true
  await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').click()`)
  await settle()
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`), 'false')
  assert.match(await win.webContents.executeJavaScript(`document.querySelector('.startup-error').textContent`), /系统拒绝/)
  assert.deepEqual(startupChanges, [true, false, true])
  failStartup = false
  startupState = { supported: true, enabled: true, error: '' }
  await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('focus'))`)
  await settle()
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('[role="switch"]').getAttribute('aria-checked')`), 'true')
  fs.writeFileSync(path.join(output, 'application-enabled.png'), (await win.webContents.capturePage()).toPNG())
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await settle()
  assert.equal(closeCalls, 1, 'Esc must close the settings window')
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ metrics, saveCheck: 'passed', hotkeyCheck: 'passed', roomCheck: 'passed', escapeCheck: 'passed', startupCheck: 'passed' }, null, 2))
  console.log(JSON.stringify({ result: 'PASS', viewports: metrics.length, saveCheck: 'passed', hotkeyCheck: 'passed', roomCheck: 'passed', escapeCheck: 'passed', startupCheck: 'passed', output }))
  win.destroy()
}
app.whenReady().then(main).then(() => app.quit()).catch((error) => { console.error(error); app.exit(1) })
