# 卡贴 Katie

把 X / Twitter **文字贴** 转成竖版「帖子卡片」PNG（白底贴 + 外层背景），方便再发到抖音 / 小红书。  
Turn X/Twitter text posts into vertical X-style post-card PNGs for reuse elsewhere.

**本仓库 v0.1**：仅「抓取 → 预览 → 本地下载」。不含抖音 / 小红书发布。

## 功能 / What works

- 在 `x.com` / `twitter.com` 推文页打开插件弹窗
- 抓取当前 status（或时间线首条）文字贴：正文、作者、handle
- 选项：隐藏 handle、显示作者、比例 `3:4` / `9:16`、背景预设
- 实时 canvas 预览，下载 PNG 到本地

## 不做 / Out of scope (v0.1)

- 抖音 / 小红书自动发布
- 线程多图轮播
- 图片/视频贴的媒体截取（有媒体时仍只渲文字卡）
- Firefox / 商店上架

## 开发 / Develop

```bash
npm install
npm test
npm run build
```

Node 侧渲染（单测 / `scripts/render-fixture.ts`）会注册系统里的文泉驿微米黑等 CJK 字体；Linux 建议安装 `fonts-wqy-microhei`（以及可选的 `fonts-noto-cjk`）。画布会去掉 emoji，避免缺字形变成 □。头像来自 `pbs.twimg.com` 时需扩展 host 权限（已写入 manifest）。

产物在 `dist/`。Chrome → 扩展程序 → 开发者模式 → **加载已解压的扩展程序** → 选 `dist`。

1. 打开一条公开文字推文（`https://x.com/.../status/...`）
2. 点击工具栏「卡贴」图标
3. 调选项，确认预览
4. 点「下载 PNG」

若弹窗显示「当前页没读到文字贴」，确认已在推文页且页面已加载完成，然后刷新后再试。

## 架构 / Architecture

Popup pipeline（无 DOM 注入按钮）：

1. Content script 刮取 → `PostText`
2. Popup 设 `RenderOptions`，纯模块 `render/card.ts` 出 PNG
3. Background service worker 走 `chrome.downloads`

## License

MIT
