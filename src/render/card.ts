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

const FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif'

const PAD_RATIO = 0.1
const MIN_BODY_PX = 28
const MAX_BODY_PX = 72
const AUTHOR_PX = 36
const HANDLE_PX = 28
const QUOTE_PX = 120

/** Pure text decisions for the card — used by renderer and unit tests. */
export function cardVisibleText(
  post: PostText,
  options: Pick<RenderOptions, 'hideHandle' | 'showAuthor'>,
): { body: string; authorLine?: string; handleLine?: string } {
  const body = post.text.trim()
  const authorLine =
    options.showAuthor && post.authorDisplayName?.trim()
      ? post.authorDisplayName.trim()
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { body, authorLine, handleLine }
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
    let current = ''
    for (const ch of paragraph) {
      const next = current + ch
      if (ctx.measureText(next).width <= maxWidth) {
        current = next
      } else {
        if (current) lines.push(current)
        current = ch
      }
    }
    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
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
  const grad = ctx.createLinearGradient(0, 0, width, height)
  grad.addColorStop(0, background.from)
  grad.addColorStop(1, background.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function isDarkBackground(background: Background): boolean {
  const sample = background.kind === 'solid' ? background.color : background.from
  const hex = sample.replace('#', '')
  if (hex.length !== 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.45
}

function fitBody(
  ctx: CanvasRenderingContext2D,
  body: string,
  maxWidth: number,
  maxHeight: number,
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = MAX_BODY_PX; fontSize >= MIN_BODY_PX; fontSize -= 2) {
    const lineHeight = Math.round(fontSize * 1.45)
    ctx.font = `500 ${fontSize}px ${FONT_STACK}`
    const lines = wrapLines(ctx, body, maxWidth)
    const total = lines.length * lineHeight
    if (total <= maxHeight) {
      return { fontSize, lines, lineHeight }
    }
  }
  const fontSize = MIN_BODY_PX
  const lineHeight = Math.round(fontSize * 1.45)
  ctx.font = `500 ${fontSize}px ${FONT_STACK}`
  let lines = wrapLines(ctx, body, maxWidth)
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = last.replace(/.{0,2}$/, '…')
  }
  return { fontSize, lines, lineHeight }
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
 * Pure renderer: (PostText, RenderOptions) => PNG bytes.
 * No Chrome APIs. Optional createCanvas for Node tests.
 */
export async function renderCardPng(
  post: PostText,
  options: RenderOptions,
  createCanvas: CreateCanvas = defaultCreateCanvas,
): Promise<Uint8Array> {
  const { width, height } = sizeForAspect(options.aspect)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  fillBackground(ctx, width, height, options.background)
  const dark = isDarkBackground(options.background)
  const ink = dark ? '#f5f5f4' : '#1c1917'
  const muted = dark ? '#a8a29e' : '#78716c'

  const pad = Math.round(width * PAD_RATIO)
  const contentWidth = width - pad * 2
  const { body, authorLine, handleLine } = cardVisibleText(post, options)

  ctx.fillStyle = ink
  ctx.font = `300 ${QUOTE_PX}px Georgia, "Times New Roman", serif`
  ctx.fillText('“', pad - 8, pad + QUOTE_PX * 0.72)

  const footerReserve = (authorLine || handleLine ? 120 : 40) + pad
  const bodyTop = pad + Math.round(QUOTE_PX * 0.55)
  const bodyMaxHeight = height - bodyTop - footerReserve

  const fitted = fitBody(ctx, body, contentWidth, bodyMaxHeight)
  ctx.fillStyle = ink
  ctx.font = `500 ${fitted.fontSize}px ${FONT_STACK}`
  let y = bodyTop + fitted.fontSize
  for (const line of fitted.lines) {
    ctx.fillText(line, pad, y)
    y += fitted.lineHeight
  }

  let footerY = height - pad - 8
  if (handleLine) {
    ctx.fillStyle = muted
    ctx.font = `400 ${HANDLE_PX}px ${FONT_STACK}`
    ctx.fillText(handleLine, pad, footerY)
    footerY -= HANDLE_PX + 16
  }
  if (authorLine) {
    ctx.fillStyle = ink
    ctx.font = `600 ${AUTHOR_PX}px ${FONT_STACK}`
    ctx.fillText(authorLine, pad, footerY)
  }

  return canvasToPngBytes(canvas)
}

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A */
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
