// Exercise real built overlay motion, lifetime and alignment with isolated IPC events.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const project = path.resolve(__dirname, '..')
const output = path.join(project, 'artifacts', 'overlay-preview')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lan-overlay-qa-')))
app.disableHardwareAcceleration()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ width: 1040, height: 500, show: false, frame: false, backgroundColor: '#28364b',
    webPreferences: { preload: path.join(project, 'out/preload/index.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true }
  })
  await win.loadFile(path.join(project, 'out/renderer/overlay.html'))
  await wait(150)
  await win.webContents.executeJavaScript(`(() => {
    window.overlayResults = [];
    const observed = new Map();
    const rangeRect = element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); };
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element) || !node.matches('.dm')) continue;
          const text = rangeRect(node.querySelector('.dm-text'));
          const name = rangeRect(node.querySelector('.dm-name'));
          const animation = node.getAnimations()[0];
          const result = { message: node.querySelector('.dm-text').textContent.trim(), addedAt: performance.now(),
            travelDuration: animation.effect.getTiming().duration,
            centerDifference: Math.abs((text.left + text.right) / 2 - (name.left + name.right) / 2) };
          observed.set(node, result); window.overlayResults.push(result);
        }
        for (const node of mutation.removedNodes) {
          if (observed.has(node)) { const result = observed.get(node); result.elapsed = performance.now() - result.addedAt; }
        }
      }
    }).observe(document.querySelector('.layer'), { childList: true });
    window.sampleMotion = () => [...document.querySelectorAll('.dm')].map(node => {
      const animation = node.getAnimations()[0];
      const time = animation.currentTime;
      animation.pause();
      animation.currentTime = 200;
      const start = node.getBoundingClientRect();
      animation.currentTime = 700;
      const end = node.getBoundingClientRect();
      animation.currentTime = time;
      animation.play();
      return { dx: (end.x - start.x) * 2, dy: (end.y - start.y) * 2 };
    });
  })()`)
  const base = { danmakuColor: '#ffffff', danmakuFontSize: 32, danmakuPosition: 'top', danmakuDuration: 3, danmakuSpeed: 120, danmakuDirection: 'right-to-left' }
  const cases = [
    { duration: 3, speed: 120, direction: 'right-to-left', dx: -120, dy: 0, text: '速度与时长独立' },
    { duration: 1, speed: 120, direction: 'right-to-left', dx: -120, dy: 0, text: '速度与时长独立' },
    { duration: 1, speed: 240, direction: 'left-to-right', dx: 240, dy: 0, text: '短消息' },
    { duration: 1, speed: 120, direction: 'bottom-to-top', dx: 0, dy: -120, text: '从下向上' },
    { duration: 1, speed: 120, direction: 'top-to-bottom', dx: 0, dy: 120, text: '从上向下' }
  ]
  for (const sample of cases) {
    win.webContents.send('overlay:style', { ...base, danmakuDuration: sample.duration, danmakuSpeed: sample.speed, danmakuDirection: sample.direction })
    await wait(30)
    win.webContents.send('overlay:dm', { text: sample.text, name: '始终居中的昵称' })
    await wait(50)
  }
  const motion = await win.webContents.executeJavaScript(`window.sampleMotion()`)
  assert.equal(motion.length, cases.length)
  motion.forEach((movement, index) => {
    assert(Math.abs(movement.dx - cases[index].dx) < 1, JSON.stringify({ index, movement }))
    assert(Math.abs(movement.dy - cases[index].dy) < 1, JSON.stringify({ index, movement }))
  })
  await wait(3200)
  const results = await win.webContents.executeJavaScript(`window.overlayResults`)
  assert.equal(results.length, cases.length)
  assert.equal(results[0].travelDuration, results[1].travelDuration, 'Changing lifetime must not change travel speed')
  for (const [index, sample] of cases.entries()) {
    const result = results[index]
    assert(result.travelDuration > sample.duration * 1000, 'Movement is not squeezed into lifetime')
    assert(result.centerDifference < 1, JSON.stringify(result))
    assert(result.elapsed >= sample.duration * 1000 - 120 && result.elapsed <= sample.duration * 1000 + 250, JSON.stringify(result))
  }
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.dm').length`), 0)
  // A message that travels completely out of the screen is removed naturally.
  win.webContents.send('overlay:style', { ...base, danmakuDuration: 3, danmakuSpeed: 600, danmakuDirection: 'top-to-bottom' })
  await wait(30)
  win.webContents.send('overlay:dm', { text: '提前移出屏幕', name: '昵称' })
  await wait(1400)
  const naturalExit = await win.webContents.executeJavaScript(`window.overlayResults.at(-1)`)
  assert(naturalExit.travelDuration < 1400)
  assert(Math.abs(naturalExit.elapsed - naturalExit.travelDuration) < 180, JSON.stringify(naturalExit))
  assert.equal(await win.webContents.executeJavaScript(`document.querySelectorAll('.dm').length`), 0)
  // Freeze a separate sample halfway through its path for a visual alignment check.
  win.webContents.send('overlay:style', base)
  await wait(30)
  win.webContents.send('overlay:dm', { text: '按设定速度移动，三秒后消失', name: '居中的昵称' })
  await wait(60)
  await win.webContents.executeJavaScript(`(() => { const animation = document.querySelector('.dm').getAnimations()[0]; animation.pause(); animation.currentTime = animation.effect.getTiming().duration / 2; })()`)
  await wait(60)
  fs.writeFileSync(path.join(output, 'nickname-centered.png'), (await win.webContents.capturePage()).toPNG())
  const report = { result: 'PASS', motion, results, naturalExit }
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  win.destroy()
}
app.whenReady().then(main).then(() => app.quit()).catch((error) => { console.error(error); app.exit(1) })
