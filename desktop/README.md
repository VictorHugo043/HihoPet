# Hiho 桌面应用

Electron + TypeScript 实现的透明桌宠。共享动画、手势识别和互动逻辑位于同一代码目录；macOS 提供开发预览，Windows 待验证和打包。

## 打开 macOS 应用

将预览包解压，双击 `Hiho.app`。也可以将它拖到“应用程序”文件夹后打开。Hiho 出现在桌面右下角，菜单栏蓝色小图标提供与右键相同的控制菜单。

预览包使用本地临时签名，尚未通过 Apple 公证；其他 Mac 可能会阻止打开。公开下载包需完成签名、公证及素材分发授权检查。

## 互动

| 操作 | 反应 |
| --- | --- |
| 左键单击 | 挥手、歪头或开心欢呼，并随机播放原声、轻快或双声 Hi-ho 变化 |
| 双击 | 蓄力跳跃，落地回弹 |
| 拖起并移动 | 悬空挣扎，随移动方向摇晃，松手后回弹 |
| 连续快速来回拖动 | 晕乎乎、慢慢醒来、生气跺脚，随后消气 |
| 在周围连续绕圈移动鼠标 | 视线追着转，持续约两圈半后转晕 |
| 右键或菜单栏图标 | 跳舞、睡觉／叫醒、安静模式、三档大小、退出 |

透明区域的鼠标事件穿透到下方应用。位置、大小和安静模式保存在系统应用数据目录中；应用没有网络请求。

## 本地开发

需要 Node.js 22.12 或更高版本、npm。macOS 打包需要系统自带的 `codesign` 与 `ditto`。

```sh
cd desktop
npm ci
npx install-electron
npm test
npm start
```

```sh
npm run package:mac
```

生成 `out/Hiho-darwin-arm64/Hiho.app` 与 `out/Hiho-macOS-arm64.zip`（Apple Silicon）；在 Intel Mac 上构建时架构为 `x64`。输出目录不进入 Git。

## 目录与许可

- `src/shared/behavior.ts`：互动状态、拖动和绕圈识别。
- `src/renderer.ts`：Canvas 动画、透明像素命中及声音播放。
- `src/main.ts`：透明窗口、全局鼠标位置、菜单和本地设置。
- `assets/`：透明动作图集、应用图标与三种叫声变化。
- `tests/`：手势边界、恢复顺序、随机播放与资源契约测试。

应用代码采用 [MIT](LICENSE)，素材和录音的权利见 [THIRD_PARTY.md](THIRD_PARTY.md) 及仓库根目录许可。
