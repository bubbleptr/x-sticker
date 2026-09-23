import {
  ASPECT_SIZE,
  type AspectRatio,
  type Background,
  type PostText,
  type RenderOptions,
} from '../types'

export type CardCanvas = {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  convertToBlob?(options?: { type?: string }): Promise<Blob>
  toBuffer?(mime?: string): Buffer
}

export type CreateCanvas = (width: number, height: number) => CardCanvas
export type LoadImageFn = (url: string) => Promise<CanvasImageSource | null>

export const FONT_STACK =
  '"WenQuanYi Micro Hei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans", "Segoe UI", sans-serif'

const OUTER_PAD_RATIO = 0.08
const MIN_BODY_PX = 34
const MAX_BODY_PX = 40
const CARD_RADIUS = 16
const AVATAR_SIZE = 48
const META_H = 34
const ACTION_H = 40
const DIVIDER_GAP = 14

const COLOR = {
  ink: '#0f1419',
  muted: '#536471',
  divider: '#eff3f4',
  like: '#f91880',
  bookmark: '#1d9bf0',
  verified: '#1d9bf0',
  card: '#ffffff',
}

/** Characters that should not start a line (CJK + common punct). */
export const NO_LINE_START = '，。！？；、：）》」』…,.!?;:)]}'

const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu
const VS_RE = /[\uFE0E\uFE0F]/g
const KEYCAP_RE = /[0-9#*]\uFE0F?\u20E3/g

export function cardVisibleText(
  post: PostText,
  options: Pick<RenderOptions, 'hideHandle' | 'showAuthor'>,
): { body: string; displayName?: string; handleLine?: string } {
  const body = sanitizeCardText(post.text)
  const displayName =
    options.showAuthor && post.authorDisplayName?.trim()
      ? sanitizeCardText(post.authorDisplayName)
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { body, displayName, handleLine }
}

export function sanitizeCardText(raw: string): string {
  return raw
    .replace(EMOJI_RE, '')
    .replace(KEYCAP_RE, '')
    .replace(VS_RE, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function isLatinWordChar(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch) || ch === "'" || ch === '’' || ch === '_' || ch === '-'
}

export function tokenizeForWrap(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  const chars = [...text]
  while (i < chars.length) {
    const ch = chars[i]!
    if (ch === '\n') {
      tokens.push('\n')
      i += 1
      continue
    }
    if (/\s/.test(ch)) {
      let sp = ch
      i += 1
      while (i < chars.length && /\s/.test(chars[i]!) && chars[i] !== '\n') {
        sp += chars[i]
        i += 1
      }
      tokens.push(sp)
      continue
    }
    if (isLatinWordChar(ch)) {
      let word = ch
      i += 1
      while (i < chars.length && isLatinWordChar(chars[i]!)) {
        word += chars[i]
        i += 1
      }
      while (i < chars.length && /[.,!?;:]/.test(chars[i]!)) {
        word += chars[i]
        i += 1
      }
      tokens.push(word)
      continue
    }
    tokens.push(ch)
    i += 1
  }
  return tokens
}

export function avoidLineStartPunctuation(lines: string[]): string[] {
  const out = lines.map((l) => l)
  for (let i = 1; i < out.length; i++) {
    while (out[i] && NO_LINE_START.includes([...out[i]!][0]!)) {
      const chars = [...out[i]!]
      const head = chars.shift()!
      out[i - 1] = `${out[i - 1] ?? ''}${head}`
      out[i] = chars.join('')
    }
  }
  return out.map((l) => l.trimEnd()).filter((l, idx) => l.length > 0 || idx === 0)
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n/)
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    const tokens = tokenizeForWrap(paragraph)
    let current = ''

    const flush = () => {
      if (current) {
        lines.push(current)
        current = ''
      }
    }

    for (const token of tokens) {
      if (token === '\n') {
        flush()
        continue
      }
      if (/^\s+$/.test(token)) {
        if (!current) continue
        const withSpace = current + ' '
        if (ctx.measureText(withSpace).width <= maxWidth) {
          current = withSpace
        } else {
          flush()
        }
        continue
      }

      if (
        current &&
        token.length === 1 &&
        NO_LINE_START.includes(token) &&
        ctx.measureText(current + token).width <= maxWidth * 1.02
      ) {
        current += token
        continue
      }

      const candidate = current ? current + token : token
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
        continue
      }

      if (current) flush()

      if (ctx.measureText(token).width <= maxWidth) {
        current = token
        continue
      }

      let chunk = ''
      for (const ch of token) {
        const next = chunk + ch
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk = next
        }
      }
      current = chunk
    }
    flush()
  }

  return avoidLineStartPunctuation(lines.length > 0 ? lines : [''])
}

/** Compact count: en `44K` / zh-CN `1.4万`. */
export function formatCompactCount(n: number, locale: 'zh-CN' | 'en' = 'zh-CN'): string {
  if (locale === 'zh-CN') {
    if (n < 10_000) return String(Math.round(n))
    if (n < 100_000_000) {
      // X-style: 14671 → 1.4万 (truncate to 1 decimal)
      const truncated = Math.floor((n / 10_000) * 10) / 10
      return `${String(truncated).replace(/\.0$/, '')}万`
    }
    const truncated = Math.floor((n / 100_000_000) * 10) / 10
    return `${String(truncated).replace(/\.0$/, '')}亿`
  }
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) {
    const v = n / 1000
    return `${v.toFixed(v >= 10 || Number.isInteger(v) ? 0 : 1).replace(/\.0$/, '')}K`
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  if (n < 1_000_000_000) {
    const v = n / 1_000_000
    return `${v.toFixed(v >= 10 ? 0 : 1).replace(/\.0$/, '')}M`
  }
  return `${Math.round(n / 1_000_000_000)}B`
}

/** zh-CN: `下午11:32 · 2026年9月22日` ; en: `11:32 PM · Sep 22, 2026`. */
export function formatMetaClock(
  iso?: string,
  locale: 'zh-CN' | 'en' = 'zh-CN',
  timeZone = 'Asia/Shanghai',
): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''

  if (locale === 'zh-CN') {
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
    const dayPeriod = parts.dayPeriod ?? ''
    const hour = parts.hour ?? ''
    const minute = parts.minute ?? ''
    const year = parts.year ?? ''
    const month = parts.month ?? ''
    const day = parts.day ?? ''
    // Prefer 上午/下午 + H:MM (X web style)
    const period = /午|上午|下午|晚上|凌晨|清晨/.test(dayPeriod)
      ? dayPeriod
      : Number(hour) >= 12
        ? '下午'
        : '上午'
    let h12 = Number(hour)
    if (Number.isNaN(h12)) h12 = 0
    // zh-CN hour12 may already be 1–12
    return `${period}${h12}:${minute} · ${year}年${month}月${day}日`
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod} · ${parts.month} ${parts.day}, ${parts.year}`
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: Background,
): void {
  if (background.kind === 'solid') {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, width, height)
    return
  }
  const grad = ctx.createLinearGradient(0, 0, width * 0.15, height)
  grad.addColorStop(0, background.from)
  grad.addColorStop(1, background.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fitBody(
  ctx: CanvasRenderingContext2D,
  body: string,
  maxWidth: number,
  maxHeight: number,
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = MAX_BODY_PX; fontSize >= MIN_BODY_PX; fontSize -= 2) {
    const lineHeight = Math.round(fontSize * 1.3)
    ctx.font = `400 ${fontSize}px ${FONT_STACK}`
    const lines = wrapLines(ctx, body, maxWidth)
    const total = lines.reduce((sum, line) => sum + (line === '' ? lineHeight * 0.85 : lineHeight), 0)
    if (total <= maxHeight) {
      return { fontSize, lines, lineHeight }
    }
  }
  const fontSize = MIN_BODY_PX
  const lineHeight = Math.round(fontSize * 1.3)
  ctx.font = `400 ${fontSize}px ${FONT_STACK}`
  let lines = wrapLines(ctx, body, maxWidth)
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, '').replace(/.$/, '')}…`
  }
  return { fontSize, lines, lineHeight }
}

function initialsFrom(post: PostText, displayName?: string): string {
  const raw = (displayName || post.authorDisplayName || post.handle || '用').trim()
  const chars = [...raw.replace(/^@/, '')]
  return (chars[0] ?? '用').toUpperCase()
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  image: CanvasImageSource | null,
  initials: string,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (image) {
    ctx.drawImage(image, x, y, size, size)
  } else {
    ctx.fillStyle = '#cfd9de'
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = COLOR.ink
    ctx.font = `600 ${Math.round(size * 0.42)}px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, x + size / 2, y + size / 2 + 1)
  }
  ctx.restore()
}

export function drawXLogo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color = COLOR.ink,
): void {
  const s = size * 0.42
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2.5, size * 0.14)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - s, cy - s)
  ctx.lineTo(cx + s, cy + s)
  ctx.moveTo(cx + s, cy - s)
  ctx.lineTo(cx - s, cy + s)
  ctx.stroke()
  ctx.restore()
}

function drawMenuDots(ctx: CanvasRenderingContext2D, right: number, cy: number, color = COLOR.muted): void {
  ctx.save()
  ctx.fillStyle = color
  const r = 2.2
  const gap = 7
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(right - i * gap, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawVerifiedBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.fillStyle = COLOR.verified
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(2, size * 0.12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const s = size
  ctx.moveTo(x + s * 0.28, y + s * 0.52)
  ctx.lineTo(x + s * 0.44, y + s * 0.68)
  ctx.lineTo(x + s * 0.74, y + s * 0.34)
  ctx.stroke()
  ctx.restore()
}

function drawReplyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  // speech bubble
  ctx.moveTo(x + s * 0.15, y + s * 0.2)
  ctx.quadraticCurveTo(x, y + s * 0.2, x, y + s * 0.4)
  ctx.quadraticCurveTo(x, y + s * 0.65, x + s * 0.35, y + s * 0.65)
  ctx.lineTo(x + s * 0.2, y + s * 0.88)
  ctx.lineTo(x + s * 0.45, y + s * 0.65)
  ctx.quadraticCurveTo(x + s, y + s * 0.65, x + s, y + s * 0.4)
  ctx.quadraticCurveTo(x + s, y + s * 0.2, x + s * 0.7, y + s * 0.2)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function drawRepostIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // two bent arrows
  ctx.beginPath()
  ctx.moveTo(x + s * 0.2, y + s * 0.35)
  ctx.lineTo(x + s * 0.2, y + s * 0.2)
  ctx.lineTo(x + s * 0.75, y + s * 0.2)
  ctx.lineTo(x + s * 0.75, y + s * 0.45)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.62, y + s * 0.32)
  ctx.lineTo(x + s * 0.75, y + s * 0.45)
  ctx.lineTo(x + s * 0.88, y + s * 0.32)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.8, y + s * 0.65)
  ctx.lineTo(x + s * 0.8, y + s * 0.8)
  ctx.lineTo(x + s * 0.25, y + s * 0.8)
  ctx.lineTo(x + s * 0.25, y + s * 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.12, y + s * 0.68)
  ctx.lineTo(x + s * 0.25, y + s * 0.55)
  ctx.lineTo(x + s * 0.38, y + s * 0.68)
  ctx.stroke()
  ctx.restore()
}

function drawHeartIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  filled: boolean,
): void {
  ctx.save()
  ctx.beginPath()
  const top = y + s * 0.32
  ctx.moveTo(x + s * 0.5, y + s * 0.82)
  ctx.bezierCurveTo(x + s * 0.1, y + s * 0.58, x + s * 0.05, top, x + s * 0.5, y + s * 0.38)
  ctx.bezierCurveTo(x + s * 0.95, top, x + s * 0.9, y + s * 0.58, x + s * 0.5, y + s * 0.82)
  ctx.closePath()
  if (filled) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    ctx.stroke()
  }
  ctx.restore()
}

function drawBookmarkIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  filled: boolean,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.28, y + s * 0.12)
  ctx.lineTo(x + s * 0.72, y + s * 0.12)
  ctx.lineTo(x + s * 0.72, y + s * 0.88)
  ctx.lineTo(x + s * 0.5, y + s * 0.7)
  ctx.lineTo(x + s * 0.28, y + s * 0.88)
  ctx.closePath()
  if (filled) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  ctx.restore()
}

function drawShareIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + s * 0.5, y + s * 0.15)
  ctx.lineTo(x + s * 0.5, y + s * 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.32, y + s * 0.32)
  ctx.lineTo(x + s * 0.5, y + s * 0.15)
  ctx.lineTo(x + s * 0.68, y + s * 0.32)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + s * 0.22, y + s * 0.5)
  ctx.lineTo(x + s * 0.22, y + s * 0.82)
  ctx.lineTo(x + s * 0.78, y + s * 0.82)
  ctx.lineTo(x + s * 0.78, y + s * 0.5)
  ctx.stroke()
  ctx.restore()
}

function drawDivider(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.strokeStyle = COLOR.divider
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.stroke()
}

export async function loadAvatarImage(
  url: string | undefined,
  loader?: LoadImageFn,
): Promise<CanvasImageSource | null> {
  if (!url) return null
  if (loader) {
    try {
      return await loader(url)
    } catch {
      return null
    }
  }
  if (typeof Image !== 'undefined') {
    return await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
  }
  return null
}

async function canvasToPngBytes(canvas: CardCanvas): Promise<Uint8Array> {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const buf = await blob.arrayBuffer()
    return new Uint8Array(buf)
  }
  if (typeof canvas.toBuffer === 'function') {
    const buf = canvas.toBuffer('image/png')
    return new Uint8Array(buf)
  }
  throw new Error('Canvas cannot export PNG')
}

export function defaultCreateCanvas(width: number, height: number): CardCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as CardCanvas
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    return el as unknown as CardCanvas
  }
  throw new Error('No canvas implementation available')
}

export function sizeForAspect(aspect: AspectRatio): { width: number; height: number } {
  return ASPECT_SIZE[aspect]
}

/**
 * X web status-detail block on an outer sticker background (light theme).
 */
export async function renderCardPng(
  post: PostText,
  options: RenderOptions,
  createCanvas: CreateCanvas = defaultCreateCanvas,
  loadImage?: LoadImageFn,
): Promise<Uint8Array> {
  const locale = options.locale ?? 'zh-CN'
  const showMenu = options.showMenu !== false
  const { width, height } = sizeForAspect(options.aspect)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.textBaseline = 'alphabetic'
  ctx.imageSmoothingEnabled = true

  fillBackground(ctx, width, height, options.background)

  const outerPad = Math.round(width * OUTER_PAD_RATIO)
  const cardW = width - outerPad * 2
  const cardPad = Math.round(cardW * 0.05)
  const { body, displayName, handleLine } = cardVisibleText(post, options)

  const headerH = AVATAR_SIZE
  const nameGap = 16
  const footerBlock = DIVIDER_GAP + META_H + DIVIDER_GAP + ACTION_H + 4
  const textMaxW = cardW - cardPad * 2
  const maxCardH = height - outerPad * 2
  const bodyBudget = maxCardH - cardPad * 2 - headerH - nameGap - footerBlock
  const fitted = fitBody(ctx, body, textMaxW, Math.max(bodyBudget, MIN_BODY_PX * 3))
  const bodyBlockH = fitted.lines.reduce(
    (sum, line) => sum + (line === '' ? fitted.lineHeight * 0.85 : fitted.lineHeight),
    0,
  )
  const cardH = Math.min(
    maxCardH,
    cardPad * 2 + headerH + nameGap + bodyBlockH + footerBlock,
  )
  const cardX = outerPad
  const cardY = Math.round((height - cardH) / 2)

  ctx.save()
  ctx.shadowColor = 'rgba(15, 20, 25, 0.18)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 10
  roundRectPath(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fillStyle = COLOR.card
  ctx.fill()
  ctx.restore()

  roundRectPath(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fillStyle = COLOR.card
  ctx.fill()

  const avatar = await loadAvatarImage(post.avatarUrl, loadImage)
  const ax = cardX + cardPad
  const ay = cardY + cardPad
  drawAvatar(ctx, ax, ay, AVATAR_SIZE, avatar, initialsFrom(post, displayName))

  if (showMenu) {
    drawMenuDots(ctx, cardX + cardW - cardPad - 2, ay + 12)
  }

  const textLeft = ax + AVATAR_SIZE + 12
  const textRightLimit = cardX + cardW - cardPad - (showMenu ? 36 : 8)
  const nameMaxW = Math.max(40, textRightLimit - textLeft - (post.verified ? 26 : 0))

  const hasName = Boolean(displayName)
  const hasHandle = Boolean(handleLine)
  const nameBaseline = hasHandle ? ay + 20 : ay + AVATAR_SIZE / 2 + 7

  if (hasName) {
    ctx.fillStyle = COLOR.ink
    ctx.font = `700 20px ${FONT_STACK}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    let name = displayName!
    while (name.length > 1 && ctx.measureText(name).width > nameMaxW) {
      name = `${[...name].slice(0, -2).join('')}…`
    }
    ctx.fillText(name, textLeft, nameBaseline)
    if (post.verified) {
      const nw = ctx.measureText(name).width
      drawVerifiedBadge(ctx, textLeft + nw + 6, nameBaseline - 16, 18)
    }
  }

  if (hasHandle) {
    ctx.fillStyle = COLOR.muted
    ctx.font = `400 15px ${FONT_STACK}`
    const hy = hasName ? nameBaseline + 22 : ay + AVATAR_SIZE / 2 + 7
    let handle = handleLine!
    while (handle.length > 1 && ctx.measureText(handle).width > nameMaxW + 24) {
      handle = `${handle.slice(0, -2)}…`
    }
    ctx.fillText(handle, textLeft, hy)
  }

  if (!hasName && !hasHandle) {
    ctx.fillStyle = COLOR.ink
    ctx.font = `700 20px ${FONT_STACK}`
    ctx.fillText('用户', textLeft, ay + AVATAR_SIZE / 2 + 7)
  }

  const bodyTop = ay + headerH + nameGap
  ctx.fillStyle = COLOR.ink
  ctx.font = `400 ${fitted.fontSize}px ${FONT_STACK}`
  ctx.textAlign = 'left'
  let y = bodyTop + fitted.fontSize
  for (const line of fitted.lines) {
    if (line === '') {
      y += fitted.lineHeight * 0.85
      continue
    }
    ctx.fillText(line, cardX + cardPad, y)
    y += fitted.lineHeight
  }

  let fy = cardY + cardH - cardPad - ACTION_H - DIVIDER_GAP - META_H - DIVIDER_GAP
  drawDivider(ctx, cardX + cardPad, fy, textMaxW)
  fy += DIVIDER_GAP + 2

  const clock = formatMetaClock(post.createdAt, locale)
  const views = post.stats?.views
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 15px ${FONT_STACK}`
  ctx.fillStyle = COLOR.muted
  let metaX = cardX + cardPad
  if (clock) {
    ctx.fillText(clock, metaX, fy + 18)
    metaX += ctx.measureText(clock).width
  }
  if (views !== undefined) {
    const sep = clock ? ' · ' : ''
    ctx.fillStyle = COLOR.muted
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(sep, metaX, fy + 18)
    metaX += ctx.measureText(sep).width
    const viewNum = formatCompactCount(views, locale)
    ctx.fillStyle = COLOR.ink
    ctx.font = `700 15px ${FONT_STACK}`
    ctx.fillText(viewNum, metaX, fy + 18)
    metaX += ctx.measureText(viewNum).width
    ctx.fillStyle = COLOR.muted
    ctx.font = `400 15px ${FONT_STACK}`
    ctx.fillText(locale === 'zh-CN' ? ' 查看' : ' Views', metaX, fy + 18)
  }

  fy += META_H - 4
  drawDivider(ctx, cardX + cardPad, fy, textMaxW)
  fy += DIVIDER_GAP

  const stats = post.stats ?? {}
  const slotW = textMaxW / 5
  const iconSize = 22
  const actions: Array<{
    draw: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c: string, fill?: boolean) => void
    count?: number
    color: string
    filled?: boolean
    showCount: boolean
  }> = [
    {
      draw: (c, x, y, s, col) => drawReplyIcon(c, x, y, s, col),
      count: stats.replies,
      color: COLOR.muted,
      showCount: true,
    },
    {
      draw: (c, x, y, s, col) => drawRepostIcon(c, x, y, s, col),
      count: stats.reposts,
      color: COLOR.muted,
      showCount: true,
    },
    {
      draw: (c, x, y, s, col, fill) => drawHeartIcon(c, x, y, s, col, Boolean(fill)),
      count: stats.likes,
      color: post.liked ? COLOR.like : COLOR.muted,
      filled: Boolean(post.liked),
      showCount: true,
    },
    {
      draw: (c, x, y, s, col, fill) => drawBookmarkIcon(c, x, y, s, col, Boolean(fill)),
      count: stats.bookmarks,
      color: post.bookmarked ? COLOR.bookmark : COLOR.muted,
      filled: Boolean(post.bookmarked),
      showCount: true,
    },
    {
      draw: (c, x, y, s, col) => drawShareIcon(c, x, y, s, col),
      color: COLOR.muted,
      showCount: false,
    },
  ]

  actions.forEach((action, i) => {
    const slotX = cardX + cardPad + slotW * i
    const iconX = slotX
    const iconY = fy + 2
    action.draw(ctx, iconX, iconY, iconSize, action.color, action.filled)
    if (action.showCount && action.count !== undefined && action.count > 0) {
      ctx.fillStyle = action.color
      ctx.font = `400 13px ${FONT_STACK}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(formatCompactCount(action.count, locale), iconX + iconSize + 6, iconY + iconSize / 2)
    }
  })

  return canvasToPngBytes(canvas)
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}
