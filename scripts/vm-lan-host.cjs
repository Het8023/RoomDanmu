// Run on Windows: node scripts/vm-lan-host.cjs [guest-ip] [room-code] [--direct-only]
// Uses the project's actual LanTransport without opening Electron windows.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const crypto = require('node:crypto')
const ts = require('typescript')

const filename = path.resolve(__dirname, '../src/main/lanTransport.ts')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = module.paths
const directOnly = process.argv.includes('--direct-only')
if (directOnly) {
  if (!require('node:net').isIPv4(process.argv[2])) throw new Error('direct-only requires a guest IPv4 address')
  const dgram = require('node:dgram')
  const normalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => name === 'node:dgram' ? {
    ...dgram,
    createSocket(options) {
      const socket = dgram.createSocket(options)
      const send = socket.send.bind(socket)
      socket.send = (buffer, port, address, callback) => {
        if (address !== process.argv[2]) { callback?.(null); return }
        send(buffer, port, address, callback)
      }
      return socket
    }
  } : normalRequire(name)
}
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const roomCode = process.argv[3] || 'VMTEST'
const transport = new loaded.exports.LanTransport({ settings: {
  nickname: 'Windows-Test', roomCode, peerAddress: process.argv[2] || ''
} })
const token = crypto.randomBytes(8).toString('hex')
const checks = { discovered: false, hostToGuest: false, guestToHost: false }
let finished = false
let timer
function log(event, details) { console.log(JSON.stringify({ event, ...details })) }
function finish(code) {
  if (finished) return
  finished = true
  clearTimeout(timer)
  log(code === 0 ? 'PASS' : 'FAIL', { checks })
  transport.stop()
  process.exitCode = code
}
transport.onStatus = (info) => log('network', info)
transport.onHello = (from, room) => log('hello', { from, room })
transport.onMembers = (count) => {
  if (count > 1) {
    checks.discovered = true
    transport.sendDm(`host-probe:${token}`)
  }
}
transport.onDm = (message) => {
  log('received', message)
  if (message.text === `guest-ack:${token}`) checks.hostToGuest = true
  if (message.text.startsWith('guest-probe:')) {
    checks.guestToHost = true
    transport.sendDm(`host-ack:${message.text.slice('guest-probe:'.length)}`)
  }
  if (Object.values(checks).every(Boolean)) finish(0)
}
timer = setTimeout(() => finish(1), 45000)
process.once('SIGINT', () => finish(1))
log('starting', { roomCode, peer: process.argv[2] || 'broadcast discovery', directOnly, port: 47779 })
transport.start()
