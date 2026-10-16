import dgram from 'node:dgram'
import type { RemoteInfo } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { isIPv4 } from 'node:net'
import type { RoomManager } from './roomManager'

export const LAN_PORT = 47779
const HELLO_INTERVAL = 4000
const MEMBER_TIMEOUT = 15000

export interface Member {
  ip: string
  port: number
  name: string
  lastSeen: number
}

interface HelloMsg {
  t: 'hello'
  id: string
  room: string
  name: string
}

interface DmMsg {
  t: 'dm'
  id: string
  room: string
  name: string
  text: string
  ts: number
}

type WireMsg = HelloMsg | DmMsg

export interface NetworkInfo {
  ready: boolean
  error: string
  addresses: string[]
  memberCount: number
}

function localInterfaces() {
  return Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? []).filter((entry) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
  )
}

// 逐网卡发送子网广播，避免 VPN/多网卡环境下只走默认路由。
export function broadcastAddresses(): string[] {
  const addresses = new Set(['255.255.255.255'])
  for (const entry of localInterfaces()) {
    const mask = entry.netmask.split('.').map(Number)
    if (mask[3] >= 254) continue // /31、/32 没有广播地址
    addresses.add(entry.address.split('.').map((part, i) => Number(part) | (~mask[i] & 255)).join('.'))
  }
  return [...addresses]
}

/**
 * 局域网房间传输：UDP 广播发现 + 单播收发弹幕（M1 阶段明文 + 房间码过滤，M2 再加加密）
 */
export class LanTransport {
  members = new Map<string, Member>()
  onDm?: (m: { name: string; text: string }) => void
  onMembers?: (count: number) => void
  onHello?: (from: string, room: string) => void
  onStatus?: (info: NetworkInfo) => void

  private socket: dgram.Socket
  private ready = false
  private error = ''
  private helloTimer?: NodeJS.Timeout
  private pruneTimer?: NodeJS.Timeout
  private currentRoom: string
  private nickname: string
  // 实例唯一 ID：用于区分自己广播的包。不能靠端口判重——
  // 所有客户端都绑定 47779，朋友的包源端口也是 47779，会被误判为自己
  private ownId = `L${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  constructor(private room: RoomManager) {
    this.socket = dgram.createSocket('udp4')
    this.currentRoom = room.settings.roomCode
    this.nickname = room.settings.nickname
  }

  get memberCount(): number {
    return this.members.size + 1
  }

  getNetworkInfo(): NetworkInfo {
    return {
      ready: this.ready,
      error: this.error,
      addresses: localInterfaces().map((entry) => entry.address),
      memberCount: this.memberCount
    }
  }

  start(): void {
    this.socket.on('message', (msg, rinfo) => this.handle(msg, rinfo))
    this.socket.on('error', (err: NodeJS.ErrnoException) => {
      this.reportError(err.code === 'EADDRINUSE'
        ? `UDP ${LAN_PORT} 端口已被占用，请退出其他弹幕实例后重启`
        : `网络错误：${err.message}`)
    })
    this.socket.bind(LAN_PORT, '0.0.0.0', () => {
      this.ready = true
      try {
        this.socket.setBroadcast(true)
      } catch (err) {
        this.reportError(`无法启用广播，可尝试 IP 直连：${(err as Error).message}`)
      }
      this.onStatus?.(this.getNetworkInfo())
      this.helloTimer = setInterval(() => this.sendHello(), HELLO_INTERVAL)
      this.pruneTimer = setInterval(() => this.prune(), 3000)
      this.sendHello()
    })
  }

  /** 房间号变更后重新绑定当前房间并清空成员 */
  restart(roomCode: string): void {
    this.currentRoom = roomCode
    this.members.clear()
    this.emitMembers()
    this.sendHello()
  }

  refresh(): void {
    this.sendHello()
  }

  stop(): void {
    this.ready = false
    if (this.helloTimer) clearInterval(this.helloTimer)
    if (this.pruneTimer) clearInterval(this.pruneTimer)
    try {
      this.socket.close()
    } catch {
      // 忽略
    }
  }

  private sendHello(): void {
    if (!this.ready) return
    this.nickname = this.room.settings.nickname
    const msg: HelloMsg = { t: 'hello', id: this.ownId, room: this.currentRoom, name: this.nickname }
    const addresses = new Set(broadcastAddresses())
    if (isIPv4(this.room.settings.peerAddress)) addresses.add(this.room.settings.peerAddress)
    for (const address of addresses) this.send(msg, LAN_PORT, address)
    // 已发现成员用单播保活，广播被屏蔽时也能保持连接。
    for (const member of this.members.values()) this.send(msg, member.port, member.ip)
  }

  private reportError(message: string): void {
    console.error('[lan]', message)
    this.error = message
    this.onStatus?.(this.getNetworkInfo())
  }

  private send(msg: WireMsg, port: number, address: string): void {
    if (!this.ready) return
    this.socket.send(Buffer.from(JSON.stringify(msg)), port, address, (err) => {
      if (err) this.reportError(`发送到 ${address}:${port} 失败：${err.message}`)
    })
  }

  /** 收到同房间 hello 时，回一个单播 hello，让双方都能互相学习到（覆盖端口不对称场景） */
  private replyHello(rinfo: RemoteInfo): void {
    const msg: HelloMsg = { t: 'hello', id: this.ownId, room: this.currentRoom, name: this.room.settings.nickname }
    this.send(msg, rinfo.port, rinfo.address)
  }

  sendDm(text: string): void {
    const msg: DmMsg = {
      t: 'dm',
      id: this.ownId,
      room: this.currentRoom,
      name: this.room.settings.nickname,
      text,
      ts: Date.now()
    }
    for (const m of this.members.values()) {
      this.send(msg, m.port, m.ip)
    }
  }

  private handle(msg: Buffer, rinfo: RemoteInfo): void {
    let data: WireMsg
    try {
      data = JSON.parse(msg.toString('utf-8')) as WireMsg
    } catch {
      return
    }
    // 用实例 ID 区分自己广播的包（不能按源端口判断：朋友也绑定 47779）
    if (!data || typeof data !== 'object' || typeof data.id !== 'string' || !data.id ||
      typeof data.name !== 'string' || data.id === this.ownId) return
    if (data.room !== this.currentRoom) return

    if (data.t === 'hello') {
      // 实例 ID 判重，避免多个网卡把同一个人计数、发送多次。
      const key = data.id
      const previous = this.members.get(key)
      this.members.set(key, { ip: rinfo.address, port: rinfo.port, name: data.name, lastSeen: Date.now() })
      this.onHello?.(`${rinfo.address}:${rinfo.port}`, data.room)
      // 只在首次发现时应答。多网卡地址交替时也应答会造成 hello 往返循环。
      if (!previous) this.replyHello(rinfo)
      if (!previous) this.emitMembers()
    } else if (data.t === 'dm' && typeof data.text === 'string' && data.text.length <= 200) {
      this.onDm?.({ name: data.name, text: data.text })
    }
  }

  private prune(): void {
    const now = Date.now()
    let changed = false
    for (const [k, m] of this.members) {
      if (now - m.lastSeen > MEMBER_TIMEOUT) {
        this.members.delete(k)
        changed = true
      }
    }
    if (changed) this.emitMembers()
  }

  private emitMembers(): void {
    this.onMembers?.(this.memberCount)
    this.onStatus?.(this.getNetworkInfo())
  }
}
