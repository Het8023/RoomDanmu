export {}

declare global {
  interface Window {
    api: {
      sendDanmaku(text: string): void
      closeInput(): void
      saveField(field: 'nickname' | 'roomCode', value: string): void
      getInitData(): Promise<{ nickname: string; roomCode: string; hotkey: string; memberCount: number; mode: string }>
      onRoomInfo(cb: (d: { memberCount: number }) => void): () => void
      onSetMode(cb: (mode: string) => void): () => void
      onDanmaku(cb: (d: { text: string; name: string }) => void): () => void
      onStyle(cb: (s: {
        nickname: string
        roomCode: string
        hotkey: string
        danmakuColor: string
        danmakuFontSize: number
        danmakuDuration: number
        danmakuSpeed: number
        danmakuDirection: 'right-to-left' | 'left-to-right' | 'bottom-to-top' | 'top-to-bottom'
        danmakuPosition: 'top' | 'middle' | 'bottom'
      }) => void): () => void
      getSettings(): Promise<{
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
      }>
      saveSettings(patch: Partial<{
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
      }>): void
      closeSettings(): void
      getStartupStatus(): Promise<{ supported: boolean; enabled: boolean; error: string }>
      setStartupEnabled(enabled: boolean): Promise<{ supported: boolean; enabled: boolean; error: string }>
      getNetworkInfo(): Promise<{ ready: boolean; error: string; addresses: string[]; memberCount: number }>
      onSaveResult(cb: (r: { ok: boolean; error: string }) => void): () => void
    }
  }
}
