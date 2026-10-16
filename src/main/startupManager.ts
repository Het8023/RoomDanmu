import { app } from 'electron'

export interface StartupStatus {
  supported: boolean
  enabled: boolean
  error: string
}

/** Windows 登录启动项以系统状态为准，避免与本地配置产生两个开关状态。 */
export class StartupManager {
  constructor(private name = 'LanDanmaku') {}

  private launchOptions() {
    return {
      name: this.name,
      path: process.execPath,
      // 免安装包使用 Electron 运行项目，必须携带绝对项目路径并加引号。
      args: process.defaultApp ? [`"${app.getAppPath()}"`, '--autostart'] : ['--autostart']
    }
  }

  getStatus(): StartupStatus {
    if (process.platform !== 'win32') return { supported: false, enabled: false, error: '' }
    try {
      const options = this.launchOptions()
      const settings = app.getLoginItemSettings({ path: options.path })
      const entry = settings.launchItems.find((item) => item.name === this.name && item.scope === 'user')
      // Windows 返回的 args 不包含 --autostart 这类开关，不能用
      // openAtLogin 的全参数比较，否则真实已启用的启动项也会被误判。
      const projectMatches = !process.defaultApp || entry?.args.some((argument) =>
        argument.replace(/^"|"$/g, '').toLowerCase() === app.getAppPath().toLowerCase())
      return {
        supported: true,
        enabled: !!projectMatches && entry?.enabled === true && entry.path.toLowerCase() === options.path.toLowerCase(),
        error: ''
      }
    } catch (error) {
      return { supported: true, enabled: false, error: `无法读取开机自启动状态：${(error as Error).message}` }
    }
  }

  setEnabled(enabled: boolean): StartupStatus {
    if (process.platform !== 'win32') return { supported: false, enabled: false, error: '当前系统不支持此开机自启动开关' }
    try {
      app.setLoginItemSettings({ ...this.launchOptions(), openAtLogin: enabled, enabled })
      const status = this.getStatus()
      if (!status.error && status.enabled !== enabled) status.error = '开机自启动未能更新，请检查 Windows 的启动应用设置'
      return status
    } catch (error) {
      return { ...this.getStatus(), error: `无法更新开机自启动：${(error as Error).message}` }
    }
  }
}
