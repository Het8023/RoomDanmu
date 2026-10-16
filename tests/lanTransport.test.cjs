const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter, once } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const dgram = require('node:dgram')

// 加载真实传输实现；类型导入会被移除，无需启动 Electron 窗口。
function loadTransport(overrides = {}) {
  const filename = path.resolve(__dirname, '../src/main/lanTransport.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const normalRequire = loaded.require.bind(loaded)
  loaded.require = (name) => overrides[name] ?? normalRequire(name)
  loaded._compile(code, filename)
  return loaded.exports
}

const iface = (address, netmask = '255.255.255.0', internal = false) => ({ family: 'IPv4', address, netmask, internal })
const interfaces = () => ({
  ethernet: [iface('192.168.20.56')],
  wifi: [iface('172.20.10.2', '255.255.255.240')],
  vpn: [iface('172.23.106.147', '255.255.0.0')],
  host: [iface('10.0.0.1', '255.255.255.255')],
  loopback: [iface('127.0.0.1', '255.0.0.0', true)],
  disconnected: [iface('169.254.1.1', '255.255.0.0')]
})

class FakeSocket extends EventEmitter {
  sent = []
  bind(port, address, callback) { this.bound = { port, address }; this.onBound = callback }
  setBroadcast(value) { this.broadcast = value }
  send(buffer, port, address, callback) {
    this.sent.push({ data: JSON.parse(buffer.toString()), port, address })
    callback?.(null)
  }
  close() {}
  receive(data, address = '192.168.20.57', port = 47779) {
    this.emit('message', Buffer.from(JSON.stringify(data)), { address, port, family: 'IPv4', size: 0 })
  }
}

function fixture(t, peerAddress = '') {
  const socket = new FakeSocket()
  const { LanTransport, broadcastAddresses } = loadTransport({
    'node:dgram': { createSocket: () => socket }, 'node:os': { networkInterfaces: interfaces }
  })
  const room = { settings: { roomCode: 'ABC123', nickname: 'Me', peerAddress } }
  const transport = new LanTransport(room)
  t.after(() => transport.stop())
  transport.start()
  return { socket, room, transport, broadcastAddresses }
}
const hello = (id = 'friend', room = 'ABC123') => ({ t: 'hello', id, room, name: 'Friend' })

test('all active IPv4 subnets are discovered, with manual IP and readiness guard', (t) => {
  const { socket, transport, broadcastAddresses } = fixture(t, '192.168.20.99')
  transport.refresh()
  transport.sendDm('before bind')
  assert.equal(socket.sent.length, 0)
  assert.deepEqual(socket.bound, { port: 47779, address: '0.0.0.0' })
  socket.onBound()
  assert.deepEqual(broadcastAddresses(), ['255.255.255.255', '192.168.20.255', '172.20.10.15', '172.23.255.255'])
  assert(socket.sent.some((message) => message.address === '192.168.20.99'))
  assert.equal(transport.getNetworkInfo().ready, true)
})

test('same-port peer joins, multiple interfaces count once, and hello replies do not loop', (t) => {
  const { socket, transport } = fixture(t)
  socket.onBound()
  socket.receive(hello())
  assert.equal(transport.memberCount, 2)
  const replies = socket.sent.length
  socket.receive(hello())
  assert.equal(socket.sent.length, replies)
  socket.receive(hello(), '172.20.10.3')
  assert.equal(transport.memberCount, 2)
  assert.equal(socket.sent.length, replies, 'address changes must not trigger hello ping-pong')
  socket.sent = []
  transport.sendDm('test')
  assert.equal(socket.sent.length, 1)
  assert.equal(socket.sent[0].address, '172.20.10.3')
  socket.sent = []
  transport.refresh()
  assert(socket.sent.some((message) => message.address === '172.20.10.3' && message.data.t === 'hello'))
})

test('self, foreign room and malformed packets are ignored; valid danmaku is delivered', (t) => {
  const { socket, transport } = fixture(t)
  socket.onBound()
  const self = socket.sent[0].data
  for (const packet of [null, [], {}, 'bad', hello('foreign', 'OTHER'), self]) socket.receive(packet)
  assert.equal(transport.memberCount, 1)
  const received = []
  transport.onDm = (message) => received.push(message)
  socket.receive({ ...hello(), t: 'dm', text: {} })
  socket.receive({ ...hello(), t: 'dm', text: 'x'.repeat(201) })
  socket.receive({ ...hello(), t: 'dm', text: 'Hello' })
  assert.deepEqual(received, [{ name: 'Friend', text: 'Hello' }])
})

test('switching rooms immediately updates count and expires missing members', (t) => {
  const { socket, room, transport } = fixture(t)
  socket.onBound()
  const counts = []
  transport.onMembers = (count) => counts.push(count)
  socket.receive(hello())
  room.settings.roomCode = 'NEW123'
  transport.restart('NEW123')
  assert.deepEqual(counts, [2, 1])
  assert.equal(socket.sent.at(-1).data.room, 'NEW123')
  socket.receive(hello())
  assert.equal(transport.memberCount, 1)
  socket.receive(hello('new', 'NEW123'))
  transport.members.get('new').lastSeen = Date.now() - 16000
  transport.prune()
  assert.equal(transport.memberCount, 1)
})

test('bind and send errors are visible instead of silently failing', (t) => {
  const { socket, transport } = fixture(t)
  socket.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' }))
  assert.match(transport.getNetworkInfo().error, /47779.*占用/)
  assert.equal(transport.getNetworkInfo().ready, false)
  socket.onBound()
  socket.send = (_buffer, _port, _address, callback) => callback(new Error('unreachable'))
  transport.refresh()
  assert.match(transport.getNetworkInfo().error, /unreachable/)
})

test('real UDP socket: hello handshake and danmaku work in both directions', { timeout: 5000 }, async (t) => {
  const { LanTransport, LAN_PORT } = loadTransport()
  const transport = new LanTransport({ settings: { roomCode: 'UDP123', nickname: 'Local', peerAddress: '' } })
  const peer = dgram.createSocket('udp4')
  t.after(() => { transport.stop(); peer.close() })
  peer.bind(0, '127.0.0.1')
  await once(peer, 'listening')
  await new Promise((resolve, reject) => {
    transport.onStatus = (info) => info.ready ? resolve() : info.error && reject(new Error(info.error))
    transport.start()
  })
  function receive() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { peer.off('message', handler); reject(new Error('UDP receive timeout')) }, 1500)
      function handler(data) { clearTimeout(timer); resolve(JSON.parse(data.toString())) }
      peer.once('message', handler)
    })
  }
  const reply = receive()
  peer.send(Buffer.from(JSON.stringify(hello('real-peer', 'UDP123'))), LAN_PORT, '127.0.0.1')
  assert.equal((await reply).t, 'hello')
  assert.equal(transport.memberCount, 2)
  const outgoing = receive()
  transport.sendDm('outgoing')
  assert.equal((await outgoing).text, 'outgoing')
  const incoming = new Promise((resolve) => { transport.onDm = resolve })
  peer.send(Buffer.from(JSON.stringify({ ...hello('real-peer', 'UDP123'), t: 'dm', text: 'incoming' })), LAN_PORT, '127.0.0.1')
  assert.deepEqual(await incoming, { name: 'Friend', text: 'incoming' })
})
