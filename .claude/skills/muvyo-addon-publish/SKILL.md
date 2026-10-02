---
name: muvyo-addon-publish
description: 签名并发布 Muvyo 第三方插件：把 src/ 下的插件源码签名加密到仓库根目录，只提交 index.json 与 plugins/ 下的签名产物，绝不提交源码、签名凭据或私钥。用户说「发布插件」「签名插件」「提交插件」「更新插件版本」时使用。
---

# 发布 Muvyo 插件

本仓库是一个 Muvyo 插件仓库：

```
src/<插件ID>/          源码（manifest.json、入口 JS、README.md），不提交
index.json             签名产物，提交
plugins/<插件ID>/      签名产物，提交
muvyo-signing.json     签名凭据（含私钥），绝不提交
mv_addon.py            签名脚本，不提交
```

## 硬性规则

- **绝不**读取、打印、复制、提交 `muvyo-signing.json` 的内容，也不要把它移到别处。只把它的路径交给签名脚本。
- **绝不**提交 `src/` 下的文件，除非用户明确说这是开源插件并已执行 `git config muvyo.publishSource true`。
- **绝不**用 `git commit --no-verify`、`git push --force`，也不要改 `.gitignore` 或 `.githooks/` 来绕过检查。
- **绝不**手工编辑 `plugins/` 下的文件：它们带签名，改一个字节都会安装失败，只能重新签名生成。
- 推送前先把要推送的提交告诉用户，得到同意再 `git push`。

## 步骤

### 1. 检查环境

```sh
git rev-parse --show-toplevel          # 在插件仓库根目录执行后续命令
test -f muvyo-signing.json && echo 有凭据
test -f mv_addon.py && echo 有脚本
python3 -c "import cryptography" && echo 有 cryptography
git config core.hooksPath              # 应输出 .githooks
```

- 没有凭据：请用户在 Muvyo「第三方插件 → 开发者」用 GitHub 账号领取证书，把下载的 `muvyo-signing.json` 放到仓库根目录。
- 没有脚本：请用户在同一页下载签名脚本 `mv_addon.py` 放到仓库根目录。
- 没有 cryptography：`pip3 install cryptography`。
- hooksPath 不是 `.githooks`：执行 `git config core.hooksPath .githooks` 启用提交检查。
- 检查 `.gitignore` 里有 `src/`、`muvyo-signing.json`、`mv_addon.py`，缺了就补上（开源插件可以没有 `src/`）。

### 2. 确定要发布的插件

- 用户点名的插件；没点名时列出 `src/` 下的插件目录，比较各自 `manifest.json` 的 `version` 与 `index.json` 里的版本，找出新增或版本不同的（`src/` 被 git 忽略，`git status` 看不到源码改动），不确定就问用户。
- 每个插件检查：
  - `src/<插件ID>/manifest.json` 的 `id` 与目录名一致，并以用户的命名空间（GitHub 用户名小写）加 `.` 开头。
  - 源码改了但 `version` 没变大（与 `index.json` 里的比较）：请用户确认新版本号，改 manifest 的 `version`（如 `1.0.0` → `1.0.1`）。版本号不变，已安装的用户收不到更新。

### 3. 签名

默认加密；只有用户明确说是开源插件才加 `--no-encrypt`。

```sh
python3 mv_addon.py sign ./src/<插件ID> -o .
python3 mv_addon.py verify ./plugins/<插件ID>
```

签名失败按提示处理：
- 「插件 ID 必须以你的命名空间开头」：改 manifest 的 `id`，同时把 `src/` 下的目录名改成一致。
- 「作者证书已过期」「这张证书不支持加密」：请用户在 Muvyo 开发者页重新领取证书，替换 `muvyo-signing.json`。
- 「manifest.json 不是有效的 JSON」「entry 必须是…」：修正源码后重签。

### 4. 只暂存签名产物

```sh
git add -A index.json plugins/<插件ID>
git status --short
```

确认暂存区里只有 `index.json` 和 `plugins/` 下的文件；出现 `src/`、`muvyo-signing.json`、`*.pem` 或 `mv_addon.py` 就 `git restore --staged <文件>` 撤出，并检查 `.gitignore`。不要用 `git add -A` / `git add .`。

### 5. 提交

```sh
git commit -m "发布 <插件ID> <版本>"
```

提交检查失败时按它的提示修正（通常是暂存了源码或凭据），不要跳过检查。

### 6. 推送

把 `git log --oneline @{u}..` 的结果告诉用户，同意后：

```sh
git push
```

推送后告诉用户：在 Muvyo「第三方插件 → 插件仓库」里刷新这个仓库，已安装的用户会看到「可更新」。
