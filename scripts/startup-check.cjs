// Validate native Windows login-item registration using an isolated temporary entry.
const { app } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const project = path.resolve(__dirname, '..')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lan startup check-'))
app.setPath('userData', path.join(temporary, 'profile'))
const name = `LanDanmaku-QA-${process.pid}-${Date.now()}`
const output = path.join(project, 'artifacts', 'startup-check')
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const approvedKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'

app.whenReady().then(() => {
  const filename = path.join(project, 'src/main/startupManager.ts')
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const original = loaded.require.bind(loaded)
  loaded.require = (id) => id === 'electron' ? { app: {
    getAppPath: () => temporary,
    getLoginItemSettings: app.getLoginItemSettings.bind(app),
    setLoginItemSettings: app.setLoginItemSettings.bind(app)
  } } : original(id)
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename)
  const startup = new loaded.exports.StartupManager(name)
  try {
    assert.equal(startup.getStatus().enabled, false)
    const enabled = startup.setEnabled(true)
    assert.equal(enabled.error, '')
    assert.equal(enabled.enabled, true)
    const entry = app.getLoginItemSettings({ path: process.execPath, args: [`"${temporary}"`, '--autostart'] }).launchItems.find((item) => item.name === name)
    assert(entry && entry.scope === 'user' && entry.enabled)
    const raw = execFileSync('reg.exe', ['query', runKey, '/v', name], { encoding: 'utf8', windowsHide: true })
    assert(raw.includes(`"${temporary}"`), 'Project path containing spaces must be quoted')
    assert(raw.includes('--autostart'))
    app.setLoginItemSettings({ name, path: process.execPath, args: [`"${temporary}"`, '--autostart'], openAtLogin: true, enabled: false })
    assert.equal(startup.getStatus().enabled, false, 'Windows Task Manager disable must be reflected')
    assert.equal(startup.setEnabled(true).enabled, true)
    assert.equal(startup.setEnabled(false).enabled, false)
    assert(!app.getLoginItemSettings().launchItems.some((item) => item.name === name))
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ result: 'PASS', userStartup: true, quotedPath: true, taskManagerDisabled: true, enableDisable: true, entryRemoved: true }, null, 2))
    console.log('Native Windows startup registration, quoted paths, Task Manager state and removal: PASS')
  } finally {
    // Remove only the unique test name, including the StartupApproved value.
    app.setLoginItemSettings({ name, path: process.execPath, args: [`"${temporary}"`, '--autostart'], openAtLogin: false })
    for (const key of [runKey, approvedKey]) {
      try { execFileSync('reg.exe', ['delete', key, '/v', name, '/f'], { windowsHide: true, stdio: 'ignore' }) } catch {}
    }
  }
}).then(() => app.quit()).catch((error) => { console.error(error); app.exit(1) })
