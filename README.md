# RoomDanmu · 房间弹幕

基于 Electron、Vue 3 和 TypeScript 的 Windows 局域网桌面弹幕工具。同一局域网内使用相同房间号，即可在各自主屏幕上接收弹幕。

## 功能

- UDP 自动发现房间成员，支持手动填写 IP 直连。
- 全局快捷键唤起输入框，Enter 发送，Esc 关闭。
- 弹幕只显示在主屏，昵称在文字下方居中。
- 颜色、字号、显示区域、移动速度、移动方向和显示时长独立设置。
- 支持 Windows 登录后自动启动，在托盘运行。

## 本地开发

安装 Node.js 和 npm，然后在项目目录执行：

```powershell
npm ci
npm run dev
```

## 构建与运行

```powershell
npm run typecheck
npm run build
npm start
```

构建后也可以双击 `启动弹幕.bat`。双方设置相同房间号，在线人数包含自己。自动发现失败时，在“设置 → 房间与连接”填写对方的局域网 IP；需要放行防火墙时，双方运行 `放行防火墙.bat`。

## 免安装包

先完成构建，再使用 Python 3 运行：

```powershell
python pack.py
```

脚本在项目目录生成 Windows x64 免安装 ZIP。解压完整文件夹后双击 `启动弹幕.bat`。

## 测试

```powershell
npm test
```

测试包含真实 UDP 收发，需要先退出正在运行的弹幕程序，释放 UDP 47779 端口。`scripts/` 中另有设置页面、弹幕动画、系统启动项和虚拟机联调的验证脚本。

更多操作见 [使用说明](使用说明.txt) 和 [给朋友的加入说明](给朋友的加入说明.md)。
