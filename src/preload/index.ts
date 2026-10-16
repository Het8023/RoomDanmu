import { contextBridge, ipcRenderer } from 'electron'
import type { StartupStatus } from '../main/startupManager'

export interface SettingsData {
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

export type StylePatch = Partial<Omit<SettingsData, 'nickname' | 'roomCode' | 'peerAddress' | 'hotkey'>>

const api = {
  // 输入窗
  sendDanmaku(text: string): void {
    ipcRenderer.send('input:send', text)
  },
  closeInput(): void {
    ipcRenderer.send('input:close')
  },
  saveField(field: 'nickname' | 'roomCode', value: string): void {
    ipcRenderer.send('input:save', field, value)
  },
  getInitData(): Promise<{ nickname: string; roomCode: string; hotkey: string; memberCount: number; mode: string }> {
    return ipcRenderer.invoke('input:init')
  },
  onRoomInfo(cb: (d: { memberCount: number }) => void): () => void {
    const h = (_: unknown, d: { memberCount: number }): void => cb(d)
    ipcRenderer.on('room:info', h)
    return () => ipcRenderer.removeListener('room:info', h)
  },
  onSetMode(cb: (mode: string) => void): () => void {
    const h = (_: unknown, mode: string): void => cb(mode)
    ipcRenderer.on('input:set-mode', h)
    return () => ipcRenderer.removeListener('input:set-mode', h)
  },
  // 弹幕层
  onDanmaku(cb: (d: { text: string; name: string }) => void): () => void {
    const h = (_: unknown, d: { text: string; name: string }): void => cb(d)
    ipcRenderer.on('overlay:dm', h)
    return () => ipcRenderer.removeListener('overlay:dm', h)
  },
  onStyle(cb: (s: SettingsData) => void): () => void {
    const h = (_: unknown, s: SettingsData): void => cb(s)
    ipcRenderer.on('overlay:style', h)
    return () => ipcRenderer.removeListener('overlay:style', h)
  },
  // 设置窗
  getSettings(): Promise<SettingsData> {
    return ipcRenderer.invoke('settings:init')
  },
  getNetworkInfo(): Promise<{ ready: boolean; error: string; addresses: string[]; memberCount: number }> {
    return ipcRenderer.invoke('network:info')
  },
  getStartupStatus(): Promise<StartupStatus> {
    return ipcRenderer.invoke('startup:status')
  },
  setStartupEnabled(enabled: boolean): Promise<StartupStatus> {
    return ipcRenderer.invoke('startup:set', enabled)
  },
  saveSettings(patch: Partial<SettingsData>): void {
    ipcRenderer.send('settings:save', patch)
  },
  closeSettings(): void {
    ipcRenderer.send('settings:close')
  },
  onSaveResult(cb: (r: { ok: boolean; error: string }) => void): () => void {
    const h = (_: unknown, r: { ok: boolean; error: string }): void => cb(r)
    ipcRenderer.on('settings:save-result', h)
    return () => ipcRenderer.removeListener('settings:save-result', h)
  }
}

contextBridge.exposeInMainWorld('api', api)
