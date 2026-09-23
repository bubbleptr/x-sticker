import { createCanvas } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  avoidLineStartPunctuation,
  cardVisibleText,
  formatCompactCount,
  formatMetaClock,
  isPng,
  renderCardPng,
  sanitizeCardText,
  tokenizeForWrap,
  wrapLines,
  type CreateCanvas,
} from './card'
import { ensureNodeCardFonts } from './nodeFonts'
import type { PostText, RenderOptions } from '../types'

const fixture: PostText = {
  text: '很多人以为效率是把日程填满，其实是把注意力留给真正重要的事。少即是多，对创作尤其如此。',
  authorDisplayName: '林间笔记',
  handle: 'linjian_notes',
  postUrl: 'https://x.com/linjian_notes/status/1234567890',
  createdAt: '2026-02-01T07:41:00.000Z',
  verified: true,
  liked: true,
  bookmarked: true,
  stats: {
    replies: 40,
    reposts: 83,
    likes: 531,
    bookmarks: 329,
    views: 44000,
  },
}

const baseOptions: RenderOptions = {
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'gradient', from: '#1d9bf0', to: '#7856ff' },
}

const nodeCreateCanvas: CreateCanvas = (width, height) => {
  const canvas = createCanvas(width, height)
  return canvas as unknown as ReturnType<CreateCanvas>
}

beforeAll(() => {
  ensureNodeCardFonts()
})

describe('sanitizeCardText', () => {
  it('strips emoji so canvas will not paint tofu', () => {
    expect(sanitizeCardText('今天心情不错😀👍继续写')).toBe('今天心情不错继续写')
  })
})

describe('format helpers', () => {
  it('formats compact counts', () => {
    expect(formatCompactCount(40)).toBe('40')
    expect(formatCompactCount(44000)).toBe('44K')
    expect(formatCompactCount(531)).toBe('531')
  })

  it('formats meta clock in Asia/Shanghai', () => {
    // 2026-02-01T07:41:00.000Z → 15:41 in Asia/Shanghai (UTC+8)
    expect(formatMetaClock('2026-02-01T07:41:00.000Z')).toBe('15:41 · 2026/2/1')
  })
})

describe('tokenizeForWrap / wrapLines', () => {
  it('keeps Latin and hyphenated compounds as single tokens', () => {
    const tokens = tokenizeForWrap('Hello tweet-sticker 世界')
    expect(tokens).toContain('Hello')
    expect(tokens).toContain('tweet-sticker')
    expect(tokens.some((t) => t === 'tweet' || t === 'sticker')).toBe(false)
  })

  it('does not break mid-Latin-word when wrapping', () => {
    const canvas = createCanvas(400, 200)
    const ctx = canvas.getContext('2d')
    const word = 'tweet-sticker'
    const lines = wrapLines(
      ctx as unknown as CanvasRenderingContext2D,
      `前缀 ${word} 后缀`,
      200,
    )
    const brokenMid = lines.some(
      (line) => line.includes('tweet-st') && !line.includes('tweet-sticker'),
    )
    expect(brokenMid).toBe(false)
  })

  it('allows breaks between CJK characters', () => {
    expect(tokenizeForWrap('竖版卡片')).toEqual(['竖', '版', '卡', '片'])
  })

  it('avoids CJK punctuation at line start', () => {
    const fixed = avoidLineStartPunctuation(['今天很好', '，继续写', '。结束'])
    expect(fixed[1]?.startsWith('，')).toBe(false)
    expect(fixed.some((l) => l.includes('，'))).toBe(true)
  })
})

describe('cardVisibleText', () => {
  it('omits @handle when hideHandle is true', () => {
    const visible = cardVisibleText(fixture, { hideHandle: true, showAuthor: true })
    expect(visible.handleLine).toBeUndefined()
    expect(visible.displayName).toBe('林间笔记')
  })

  it('includes @handle when hideHandle is false', () => {
    const visible = cardVisibleText(fixture, { hideHandle: false, showAuthor: true })
    expect(visible.handleLine).toBe('@linjian_notes')
  })
})

describe('renderCardPng', () => {
  it('returns non-empty PNG magic bytes for full X card', async () => {
    const bytes = await renderCardPng(fixture, baseOptions, nodeCreateCanvas)
    expect(bytes.byteLength).toBeGreaterThan(100)
    expect(isPng(bytes)).toBe(true)
  })

  it('renders when stats missing', async () => {
    const bare: PostText = {
      text: '一句短贴。',
      authorDisplayName: '测试',
      postUrl: 'https://x.com/t/status/1',
    }
    const bytes = await renderCardPng(
      bare,
      { ...baseOptions, hideHandle: true, aspect: '9:16' },
      nodeCreateCanvas,
    )
    expect(isPng(bytes)).toBe(true)
  })
})
