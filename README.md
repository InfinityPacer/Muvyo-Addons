# Muvyo-Addons

InfinityPacer 的 Muvyo 第三方插件仓库。在 Muvyo「第三方插件 → 插件仓库」添加 `https://github.com/InfinityPacer/Muvyo-Addons` 即可安装。

| 插件 | 能力 | 说明 |
| --- | --- | --- |
| [智能重命名](src/infinitypacer.smartrename/) | `naming` | 字段分隔符、按分类或 TMDB 换模板、渲染后替换词 |

## 开发

本仓库是开源插件仓库，`src/<插件ID>/` 源码和签名产物（`index.json`、`plugins/`）一起提交。协议与签名流程见 [muvyo-addon-guide](https://github.com/thsrite/muvyo-addon-guide)。

- 第一次克隆后执行 `git config core.hooksPath .githooks` 和 `git config muvyo.publishSource true`。
- 测试用 `npm test`（node 加载插件并模拟 `mv`），以及 `npm run test:quickjs`（QuickJS 冒烟，需要 `brew install quickjs`）。测试不放在插件目录里，因为插件目录只允许 manifest、入口 JS、README 和 manifest 里 `icon` 声明的图标。
- 签名需要把 `muvyo-signing.json` 和 `mv_addon.py` 放在仓库根目录，两者都已被 `.gitignore` 忽略。带图标的插件要用新版 Muvyo「开发者」页下载的签名脚本，并先 `pip3 install cryptography Pillow`，旧脚本不会把图标打进发布文件。签名命令是 `python3 mv_addon.py sign ./src/<插件ID> --no-encrypt -o .`。
- 发布按 `.claude/skills/muvyo-addon-publish` 的流程进行，推送前需要确认。

## 仓库签名

插件作者签名与仓库索引签名分别校验。本仓库还通过 `index.json` 中的公钥及 `index.json.sig` 保护插件列表，Muvyo 会记住仓库公钥并拒绝公钥变化、签名不符或序号回退的索引。

每次更新插件或修改索引后，在仓库根目录执行以下命令，将 `index.json` 与 `index.json.sig` 一起提交发布。仓库签名命令会递增索引序号，不改变插件版本。

```sh
python3 scripts/repository_signature.py sign
python3 scripts/repository_signature.py verify
python3 -m unittest discover -s tests -p 'test_repository_signature.py'
```

签名复用最初启用仓库签名时的作者密钥，由本地官方 `mv_addon.py` 加载凭据。请在安全位置备份完整的原始 `muvyo-signing.json`，不要上传到仓库。作者证书续期或重新领取后，仓库仍须使用原密钥，可通过 `--credential <原凭据路径>` 指定。密钥不一致时脚本会拒绝签名，避免让已添加仓库的客户端无法更新。

## 许可

GPL-3.0，与 MoviePilot 版智能重命名所在的 MoviePilot-Plugins 一致，因此插件以不加密方式发布。
