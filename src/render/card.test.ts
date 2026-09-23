import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import {
  cardVisibleText,
  isPng,
  renderCardPng,
  type CreateCanvas,
} from './card'
import type { PostText, RenderOptions } from '../types'

const fixture: PostText = {
  text: '今天天气很好，适合把一条推特文字贴做成竖版卡片。Hello Katie 卡贴。',
  authorDisplayName: '示例作者',
  handle: 'katie_demo',
  postUrl: 'https://x.com/katie_demo/status/1234567890',
  createdAt: '2026-09-23T12:00:00.000Z',
}

const baseOptions: RenderOptions = {
  hideHandle: true,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#f7f4ef' },
}

const nodeCreateCanvas: CreateCanvas = (width, height) => {
  const canvas = createCanvas(width, height)
  return canvas as unknown as ReturnType<CreateCanvas>
}

describe('cardVisibleText', () => {
  it('omits @handle when hideHandle is true', () => {
    const visible = cardVisibleText(fixture, { hideHandle: true, showAuthor: true })
    expect(visible.handleLine).toBeUndefined()
    expect(visible.authorLine).toBe('示例作者')
    expect(visible.body).toContain('卡贴')
  })

  it('includes @handle when hideHandle is false', () => {
    const visible = cardVisibleText(fixture, { hideHandle: false, showAuthor: true })
    expect(visible.handleLine).toBe('@katie_demo')
  })

  it('normalizes handle without double @@', () => {
    const visible = cardVisibleText(
      { ...fixture, handle: '@already' },
      { hideHandle: false, showAuthor: false },
    )
    expect(visible.handleLine).toBe('@already')
    expect(visible.authorLine).toBeUndefined()
  })
})

describe('renderCardPng', () => {
  it('returns non-empty PNG magic bytes', async () => {
    const bytes = await renderCardPng(fixture, baseOptions, nodeCreateCanvas)
    expect(bytes.byteLength).toBeGreaterThan(100)
    expect(isPng(bytes)).toBe(true)
  })

  it('still renders PNG when handle is shown', async () => {
    const bytes = await renderCardPng(
      fixture,
      { ...baseOptions, hideHandle: false, aspect: '9:16', background: { kind: 'gradient', from: '#1c1917', to: '#44403c' } },
      nodeCreateCanvas,
    )
    expect(isPng(bytes)).toBe(true)
  })
})
