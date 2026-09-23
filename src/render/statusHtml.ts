import type { PostText, RenderOptions } from '../types'
import { formatCompactCount, formatMetaClock } from './format'
import { VERIFIED_BADGE_SVG, X_ACTION_ICON_PATHS } from './xIcons'

const FONT =
  'TwitterChirp, "Chirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "WenQuanYi Micro Hei", "Noto Sans SC", sans-serif'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bodyHtml(text: string): string {
  const cleaned = text.replace(/\u00a0/g, ' ').trimEnd()
  const paragraphs = cleaned.split(/\n/)
  // Preserve blank lines as empty <p> for paragraph gap
  return paragraphs
    .map((line) => {
      if (line.trim() === '') return '<p class="blank">&nbsp;</p>'
      return `<p class="line">${escapeHtml(line)}</p>`
    })
    .join('')
}

function iconSvg(d: string, color: string, size = 22.5): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="${color}" d="${d}"></path></svg>`
}

/**
 * Build a standalone HTML document that mirrors X web status-detail (light).
 * Content width = 598 CSS px (measured).
 */
export function buildStatusArticleHtml(
  post: PostText,
  options: RenderOptions,
  opts?: { avatarDataUrl?: string; articleWidth?: number },
): string {
  const locale = options.locale ?? 'zh-CN'
  const showMenu = options.showMenu !== false
  const width = opts?.articleWidth ?? 598
  const showName = Boolean(options.showAuthor && post.authorDisplayName?.trim())
  const showHandle = Boolean(!options.hideHandle && post.handle?.trim())
  const name = showName ? post.authorDisplayName!.trim() : ''
  const handle = showHandle ? `@${post.handle!.trim().replace(/^@+/, '')}` : ''
  const display = name || (handle ? handle.replace(/^@/, '') : '用户')

  const clock = formatMetaClock(post.createdAt, locale)
  const views = post.stats?.views
  const viewsLabel = locale === 'zh-CN' ? '查看' : 'Views'
  const viewsHtml =
    views !== undefined
      ? `<span class="sep"> · </span><span class="views-num">${escapeHtml(formatCompactCount(views, locale))}</span><span class="views-label"> ${escapeHtml(viewsLabel)}</span>`
      : ''

  const muted = '#536471'
  const likeColor = post.liked ? '#F91880' : muted
  const bookmarkColor = post.bookmarked ? '#1D9BF0' : muted
  const likePath = post.liked ? X_ACTION_ICON_PATHS.likeFilled : X_ACTION_ICON_PATHS.likeOutline
  const bookmarkPath = post.bookmarked
    ? X_ACTION_ICON_PATHS.bookmarkFilled
    : X_ACTION_ICON_PATHS.bookmarkOutline

  const count = (n: number | undefined, color: string) =>
    n !== undefined && n > 0
      ? `<span class="count" style="color:${color}">${escapeHtml(formatCompactCount(n, locale))}</span>`
      : ''

  const avatarSrc = opts?.avatarDataUrl || post.avatarUrl || ''
  const initial = [...(name || handle || '用')][0] ?? '用'
  const avatarInner = avatarSrc
    ? `<img class="avatar-img" src="${escapeHtml(avatarSrc)}" alt="" width="40" height="40" />`
    : `<span class="avatar-fallback">${escapeHtml(initial)}</span>`

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Noto Color Emoji';
    src: local('Noto Color Emoji'), url('file:///usr/share/fonts/truetype/noto/NotoColorEmoji.ttf') format('truetype');
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #ffffff;
    color: #0f1419;
    font-family: ${FONT};
    -webkit-font-smoothing: antialiased;
  }
  body { width: ${width}px; }
  .article {
    width: ${width}px;
    padding: 12px 16px 0;
    background: #ffffff;
  }
  .header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    overflow: hidden;
    flex: 0 0 40px;
    background: #cfd9de;
  }
  .avatar-img { width: 40px; height: 40px; object-fit: cover; display: block; }
  .avatar-fallback {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 40px; font-weight: 700; font-size: 18px; color: #0f1419;
  }
  .id { flex: 1; min-width: 0; padding-top: 0; }
  .name-row {
    display: flex; align-items: center; gap: 4px;
    font-size: 15px; font-weight: 700; line-height: 20px; color: #0f1419;
  }
  .name-row .badge { display: inline-flex; flex: 0 0 auto; }
  .handle {
    font-size: 15px; font-weight: 400; line-height: 20px; color: #536471;
  }
  .menu {
    flex: 0 0 auto;
    color: #536471;
    font-size: 18px;
    line-height: 20px;
    letter-spacing: 1px;
    padding-top: 2px;
  }
  .body {
    margin-top: 12px;
    font-size: 17px;
    font-weight: 400;
    line-height: 24px;
    color: #0f1419;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .body .line { margin: 0; }
  .body .blank { height: 24px; margin: 0; }
  .meta {
    margin-top: 16px;
    padding: 16px 0;
    border-top: 1px solid #eff3f4;
    border-bottom: 1px solid #eff3f4;
    font-size: 15px;
    line-height: 20px;
    color: #536471;
  }
  .views-num { font-weight: 700; color: #0f1419; }
  .views-label, .sep { color: #536471; font-weight: 400; }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0 8px;
    max-width: 100%;
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #536471;
    min-width: 0;
  }
  .action svg { display: block; }
  .count {
    font-size: 15px;
    line-height: 20px;
    font-weight: 400;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0 16px;
    border-top: 1px solid #eff3f4;
    font-size: 15px;
    line-height: 20px;
    color: #536471;
  }
</style>
</head>
<body>
  <article class="article">
    <div class="header">
      <div class="avatar">${avatarInner}</div>
      <div class="id">
        <div class="name-row">
          <span>${escapeHtml(display)}</span>
          ${post.verified ? `<span class="badge">${VERIFIED_BADGE_SVG}</span>` : ''}
        </div>
        ${showHandle ? `<div class="handle">${escapeHtml(handle)}</div>` : ''}
      </div>
      ${showMenu ? `<div class="menu" aria-hidden="true">···</div>` : ''}
    </div>
    <div class="body">${bodyHtml(post.text)}</div>
    <div class="meta">${escapeHtml(clock)}${viewsHtml}</div>
    <div class="actions">
      <div class="action">${iconSvg(X_ACTION_ICON_PATHS.reply, muted)}${count(post.stats?.replies, muted)}</div>
      <div class="action">${iconSvg(X_ACTION_ICON_PATHS.repost, muted)}${count(post.stats?.reposts, muted)}</div>
      <div class="action">${iconSvg(likePath, likeColor)}${count(post.stats?.likes, likeColor)}</div>
      <div class="action">${iconSvg(bookmarkPath, bookmarkColor)}${count(post.stats?.bookmarks, bookmarkColor)}</div>
      <div class="action">${iconSvg(X_ACTION_ICON_PATHS.share, muted)}</div>
    </div>
  </article>
</body>
</html>`
}
