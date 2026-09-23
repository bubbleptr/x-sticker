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
  text: '我一年内都会无条件看多 Grok！Grok 一定会崛起的！相信老马！\n\n原因无他，我订阅了一年 Heavy',
  authorDisplayName: 'Kieran Zhang',
  handle: 'ninthbit_ai',
  postUrl: 'https://x.com/ninthbit_ai/status/2102420702448234995',
  createdAt: '2026-09-22T15:32:11.000Z',
  verified: true,
  liked: false,
  bookmarked: false,
  stats: {
    replies: 52,
    reposts: 0,
    likes: 90,
    bookmarks: 4,
    views: 14671,
  },
}

const baseOptions: RenderOptions = {
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#e7e9ea' },
  locale: 'zh-CN',
  showMenu: true,
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
  it('formats zh-CN compact counts like X web', () => {
    expect(formatCompactCount(90, 'zh-CN')).toBe('90')
    expect(formatCompactCount(14671, 'zh-CN')).toBe('1.4万')
    expect(formatCompactCount(44000, 'en')).toBe('44K')
  })

  it('formats zh-CN meta clock like X web', () => {
    expect(formatMetaClock('2026-09-22T15:32:11.000Z', 'zh-CN')).toBe(
      '下午11:32 · 2026年9月22日',
    )
  })
})

describe('tokenizeForWrap / wrapLines', () => {
  it('keeps Latin and hyphenated compounds as single tokens', () => {
    expect(tokenizeForWrap('Hello tweet-sticker 世界')).toContain('tweet-sticker')
  })

  it('does not break mid-Latin-word when wrapping', () => {
    const canvas = createCanvas(400, 200)
    const ctx = canvas.getContext('2d')
    const lines = wrapLines(
      ctx as unknown as CanvasRenderingContext2D,
      '前缀 tweet-sticker 后缀',
      200,
    )
    expect(
      lines.some((line) => line.includes('tweet-st') && !line.includes('tweet-sticker')),
    ).toBe(false)
  })

  it('allows breaks between CJK characters', () => {
    expect(tokenizeForWrap('竖版卡片')).toEqual(['竖', '版', '卡', '片'])
  })

  it('avoids CJK punctuation at line start', () => {
    const fixed = avoidLineStartPunctuation(['今天很好', '，继续写'])
    expect(fixed[1]?.startsWith('，')).toBe(false)
  })
})

describe('cardVisibleText', () => {
  it('omits @handle when hideHandle is true', () => {
    const visible = cardVisibleText(fixture, { hideHandle: true, showAuthor: true })
    expect(visible.handleLine).toBeUndefined()
    expect(visible.displayName).toBe('Kieran Zhang')
  })

  it('includes @handle when hideHandle is false', () => {
    const visible = cardVisibleText(fixture, { hideHandle: false, showAuthor: true })
    expect(visible.handleLine).toBe('@ninthbit_ai')
  })
})

describe('renderCardPng', () => {
  it('returns non-empty PNG for status-detail style card', async () => {
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
