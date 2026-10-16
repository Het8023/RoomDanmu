import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { isIPv4 } from 'node:net'

export type InputMode = 'dm' | 'nick' | 'room'

export type DanmakuPosition = 'top' | 'middle' | 'bottom'
export type DanmakuDirection = 'right-to-left' | 'left-to-right' | 'bottom-to-top' | 'top-to-bottom'

export interface Settings {
  nickname: string
  roomCode: string
  peerAddress: string
  hotkey: string
  danmakuColor: string
  danmakuFontSize: number
  danmakuPosition: DanmakuPosition
  danmakuDuration: number
  danmakuSpeed: number
  danmakuDirection: DanmakuDirection
}

export type DanmakuStyle = Pick<Settings, 'danmakuColor' | 'danmakuFontSize' | 'danmakuPosition' | 'danmakuDuration' | 'danmakuSpeed' | 'danmakuDirection'>

const POSITIONS: DanmakuPosition[] = ['top', 'middle', 'bottom']
const DIRECTIONS: DanmakuDirection[] = ['right-to-left', 'left-to-right', 'bottom-to-top', 'top-to-bottom']

export class RoomManager {
  settings: Settings
  private file: string

  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json')
    this.settings = this.load()
  }

  private defaults(): Settings {
    return {
      nickname: `弹友${Math.floor(1000 + Math.random() * 9000)}`,
      roomCode: this.genCode(),
      peerAddress: '',
      hotkey: 'CommandOrControl+Shift+Enter',
      danmakuColor: '#ffffff',
      danmakuFontSize: 26,
      danmakuPosition: 'top',
      danmakuDuration: 9,
      danmakuSpeed: 160,
      danmakuDirection: 'right-to-left'
    }
  }

  private genCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  load(): Settings {
    const d = this.defaults()
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Settings>
        return {
          nickname: typeof raw.nickname === 'string' && raw.nickname ? raw.nickname : d.nickname,
          roomCode: typeof raw.roomCode === 'string' && raw.roomCode.trim() ? raw.roomCode.trim().toUpperCase() : d.roomCode,
          peerAddress: typeof raw.peerAddress === 'string' && isIPv4(raw.peerAddress) ? raw.peerAddress : '',
          hotkey: typeof raw.hotkey === 'string' && raw.hotkey ? raw.hotkey : d.hotkey,
          danmakuColor: typeof raw.danmakuColor === 'string' && raw.danmakuColor ? raw.danmakuColor : d.danmakuColor,
          danmakuFontSize: typeof raw.danmakuFontSize === 'number' && raw.danmakuFontSize >= 14 && raw.danmakuFontSize <= 48 ? raw.danmakuFontSize : d.danmakuFontSize,
          danmakuPosition: POSITIONS.includes(raw.danmakuPosition as DanmakuPosition) ? (raw.danmakuPosition as DanmakuPosition) : d.danmakuPosition,
          danmakuDuration: typeof raw.danmakuDuration === 'number' && Number.isFinite(raw.danmakuDuration) && raw.danmakuDuration >= 1 && raw.danmakuDuration <= 30 ? Math.round(raw.danmakuDuration) : d.danmakuDuration,
          danmakuSpeed: typeof raw.danmakuSpeed === 'number' && Number.isFinite(raw.danmakuSpeed) && raw.danmakuSpeed >= 30 && raw.danmakuSpeed <= 600 ? Math.round(raw.danmakuSpeed) : d.danmakuSpeed,
          danmakuDirection: DIRECTIONS.includes(raw.danmakuDirection as DanmakuDirection) ? raw.danmakuDirection as DanmakuDirection : d.danmakuDirection
        }
      }
    } catch {
      // 配置损坏则回退默认
    }
    this.settings = d
    this.save()
    return d
  }

  save(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch {
      // 忽略写盘失败
    }
  }

  setNickname(name: string): void {
    this.settings.nickname = name
    this.save()
  }

  setRoomCode(code: string): void {
    this.settings.roomCode = code
    this.save()
  }

  setHotkey(hotkey: string): void {
    this.settings.hotkey = hotkey
    this.save()
  }

  setPeerAddress(address: string): void {
    this.settings.peerAddress = address
    this.save()
  }

  setDanmakuStyle(patch: Partial<DanmakuStyle>): void {
    if (patch.danmakuColor !== undefined) this.settings.danmakuColor = patch.danmakuColor
    if (patch.danmakuFontSize !== undefined) this.settings.danmakuFontSize = patch.danmakuFontSize
    if (patch.danmakuPosition !== undefined) this.settings.danmakuPosition = patch.danmakuPosition
    if (patch.danmakuDuration !== undefined) this.settings.danmakuDuration = patch.danmakuDuration
    if (patch.danmakuSpeed !== undefined) this.settings.danmakuSpeed = patch.danmakuSpeed
    if (patch.danmakuDirection !== undefined) this.settings.danmakuDirection = patch.danmakuDirection
    this.save()
  }
}
