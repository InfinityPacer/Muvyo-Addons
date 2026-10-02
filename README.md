# Muvyo-Addons

InfinityPacer 的 Muvyo 第三方插件仓库。在 Muvyo「第三方插件 → 插件仓库」添加 `https://github.com/InfinityPacer/Muvyo-Addons` 即可安装。

| 插件 | 能力 | 说明 |
| --- | --- | --- |
| [智能重命名](src/infinitypacer.smartrename/) | `naming` | 字段分隔符、按分类或 TMDB 换模板、渲染后替换词 |

## 开发

本仓库是开源插件仓库，`src/<插件ID>/` 源码和签名产物（`index.json`、`plugins/`）一起提交。协议与签名流程见 [muvyo-addon-guide](https://github.com/thsrite/muvyo-addon-guide)。

- 第一次克隆后执行 `git config core.hooksPath .githooks` 和 `git config muvyo.publishSource true`。
- 测试用 `npm test`（node 加载插件并模拟 `mv`），以及 `npm run test:quickjs`（QuickJS 冒烟，需要 `brew install quickjs`）。测试不放在插件目录里，因为插件目录只允许 manifest、入口 JS 和 README。
- 签名需要把 `muvyo-signing.json` 和 `mv_addon.py` 放在仓库根目录，两者都已被 `.gitignore` 忽略。签名命令是 `python3 mv_addon.py sign ./src/<插件ID> --no-encrypt -o .`。
- 发布按 `.claude/skills/muvyo-addon-publish` 的流程进行，推送前需要确认。

## 许可

GPL-3.0，与 MoviePilot 版智能重命名所在的 MoviePilot-Plugins 一致，因此插件以不加密方式发布。
