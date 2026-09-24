# 卡贴 Katie

把 X / Twitter **文字贴** 渲成竖版 PNG（抖音 / 小红书用）。输出是 **全白底、仿 X 网页 status 详情** 的紧裁贴，不是圆角浮卡贴纸。

**v0.1**：仅「抓取 → 预览 → 本地下载」。不含平台发布。

## 功能

- 在帖子的原生分享菜单里点「做成卡贴」，页内预览并下载 PNG
- 工具栏弹窗仍抓取当前 status（或时间线首条）：正文、作者、handle、时间、互动数、头像
- 选项：隐藏 handle、显示作者、比例 `3:4` / `9:16`
- 弹窗用 HTML + `html-to-image` 预览；本机单测 / 脚本用 Chrome 截图栅格化
- 下载 PNG 到本地

## 不做

- 抖音 / 小红书自动发布
- 线程多图、图片/视频贴媒体截取
- Firefox / 商店上架

## 开发

```bash
npm install
npm test
npm run build
```

渲染样本（Kieran 贴 → `katie_x_web_v6.png`）：

```bash
npx tsx scripts/render-fixture.ts /opt/cursor/artifacts/katie_x_web_v6.png
```

Linux 建议：`fonts-wqy-microhei`、`fonts-noto-color-emoji`（以及可选 `fonts-noto-cjk`）。Chirp 字体不可用时回退系统栈。头像域 `pbs.twimg.com` / `abs.twimg.com` 已写入 manifest `host_permissions`。

产物在 `dist/`。Chrome → 扩展程序 → 开发者模式 → **加载已解压的扩展程序** → 选 `dist`。

1. 打开一条公开文字帖（`…/status/…` 或时间线）
2. 点该帖的「分享」
3. 点「做成卡贴」
4. 在页内预览里调选项，点「下载 PNG」

工具栏「卡贴」图标仍打开原来的弹窗。

## 架构

1. Content script 在打开的分享菜单里注入「做成卡贴」，刮该帖的 `PostText`，页内浮层预览。工具栏弹窗仍走 `SCRAPE_POST`。
2. `render/statusHtml.ts` 拼出 598px 宽的 X light status HTML（实测字号/色值 + 真实 SVG path）
3. 弹窗和页内浮层：`html-to-image`；Node：`playwright-core` Chrome 截 `article` → 白底竖版合成
4. Background SW → `chrome.downloads`

## License

MIT
