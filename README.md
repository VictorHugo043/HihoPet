# HIHO Pet

杰克霜精（Jack Frost / ジャックフロスト）的非官方同人桌宠。蓝色双尖帽、小尖牙笑脸和轻盈弹跳，陪你一起工作。

![HIHO 动作预览](Codex/HIHO.gif)

## 下载

| 平台 | 状态 | 下载 |
| --- | --- | --- |
| Codex Pets | 1.0.1 | [完整资源包](https://github.com/VictorHugo043/HihoPet/raw/refs/heads/main/packages/HIHO-Codex-1.0.1.zip) · [透明图集](Codex/spritesheet.png) |
| macOS 独立桌宠 | 待制作 | — |
| Windows 独立桌宠 | 待制作 | — |

## Codex 桌宠

- 待机呼吸和眨眼，挥手打招呼，蓄力弹跳。
- 左右移动采用双脚跃行，两只帽角与折尖保持可见。
- 委屈、捧手等待、托腮思考和检查结果的独立动作。
- 十六方向转头，保留原有黑色椭圆眼睛。
- 用欢呼嘴形和动作表达“Hi-ho！”，图集不包含音频。

![左右跃行](Codex/HIHO-movement.gif)

将资源包解压到 `~/.codex/pets/hiho/`，确保 `pet.json` 和 `spritesheet.png` 位于该文件夹根目录，然后在 Codex 的宠物选择器中选择 Hiho。浮窗、鼠标跟随和工作状态切换由宿主客户端提供。

## 资源

| 文件 | 用途 |
| --- | --- |
| [pet.json](Codex/pet.json) | 名称、描述与 v2 图集配置 |
| [spritesheet.png](Codex/spritesheet.png) | 可导入的透明 PNG 动作图集 |
| [HIHO.gif](Codex/HIHO.gif) | 九种基础动作的循环预览 |
| [HIHO.mp4](Codex/HIHO.mp4) | 基础动作的视频预览 |
| [HIHO-movement.gif](Codex/HIHO-movement.gif) | 左右跃行动作预览 |
| [HIHO-stills.png](Codex/HIHO-stills.png) | 待机、挥手、跳跃和等待静帧 |
| [HIHO-directions.png](Codex/HIHO-directions.png) | 十六方向视线一览 |

图集采用 v2 布局：1536 × 2288 像素，8 列 × 11 行，每格 192 × 208 像素。共有 73 个有效帧，其余 15 格完全透明。

| 行（从 0 开始） | 动作 | 帧数 |
| --- | --- | --- |
| 0 | idle / 待机 | 6 |
| 1 | running-right / 向右跃行 | 8 |
| 2 | running-left / 向左跃行 | 8 |
| 3 | waving / 挥手 | 4 |
| 4 | jumping / 跳跃 | 5 |
| 5 | failed / 委屈 | 8 |
| 6 | waiting / 等待 | 6 |
| 7 | running / 思考工作 | 6 |
| 8 | review / 检查结果 | 6 |
| 9–10 | 顺时针十六方向视线 | 16 |

视线从上方 0° 开始，每隔 22.5° 一帧；90° 为屏幕右侧，180° 为下方，270° 为屏幕左侧。

Jack Frost 是《真·女神转生》《女神异闻录》系列角色。本项目为非官方同人作品。

## 权利与使用

本仓库的美术素材与文档采用“保留所有权利（All rights reserved）”标记，详见 [LICENSE](LICENSE)。Jack Frost 及相关游戏、角色与商标权益归 ATLUS、SEGA 及各自权利人所有。本项目不授予这些第三方权益，也不代表官方授权。其他用途请先联系维护者并取得所需权利人的许可。
