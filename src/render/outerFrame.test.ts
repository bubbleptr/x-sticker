import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { BUNDLED_BACKGROUND_FILES, PHOTO_PRESETS } from '../photoBackgrounds'
import { BACKGROUND_PRESETS } from '../popup/presets'
import { ASPECT_SIZE } from '../types'
import { bundledBackgroundFilePath } from './bundledBackgroundFile'
import { coverDestRect, drawStatusCard, paintOuterBackground } from './outerFrame'

function rgba(ctx: { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }, x: number, y: number) {
  const data = ctx.getImageData(x, y, 1, 1).data
  return [data[0], data[1], data[2], data[3]]
}

function loadBundled(src: (typeof BUNDLED_BACKGROUND_FILES)[number]) {
  return loadImage(bundledBackgroundFilePath(src))
}

describe('coverDestRect', () => {
  it('crops the 1080×1620 photo top and bottom on a 3:4 frame', () => {
    expect(coverDestRect(1080, 1620, 1080, 1440)).toEqual({
      dx: 0,
      dy: -90,
      dw: 1080,
      dh: 1620,
    })
  })

  it('crops the sides on a 9:16 frame', () => {
    const { width, height } = ASPECT_SIZE['9:16']
    expect(coverDestRect(1080, 1620, width, height)).toEqual({
      dx: -100,
      dy: 0,
      dw: 1280,
      dh: 1920,
    })
  })
})

describe('paintOuterBackground', () => {
  it('fills a solid color', async () => {
    const canvas = createCanvas(8, 8)
    const ctx = canvas.getContext('2d')
    await paintOuterBackground(ctx, { kind: 'solid', color: '#0f1419' }, 8, 8, loadBundled)
    expect(rgba(ctx, 0, 0)).toEqual([15, 20, 25, 255])
  })

  it('fills a vertical gradient from top color to bottom color', async () => {
    const canvas = createCanvas(4, 100)
    const ctx = canvas.getContext('2d')
    await paintOuterBackground(
      ctx,
      { kind: 'gradient', from: '#000000', to: '#ffffff' },
      4,
      100,
      loadBundled,
    )
    const top = rgba(ctx, 1, 0)
    const bottom = rgba(ctx, 1, 99)
    expect(top[0]).toBeLessThan(20)
    expect(bottom[0]).toBeGreaterThan(230)
  })

  it('cover-fills a bundled photo', async () => {
    const { width, height } = ASPECT_SIZE['3:4']
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    await paintOuterBackground(
      ctx,
      { kind: 'image', src: 'backgrounds/hk-harbor.jpg' },
      width,
      height,
      loadBundled,
    )
    const photo = await loadBundled('backgrounds/hk-harbor.jpg')
    const source = createCanvas(photo.width, photo.height)
    const sourceCtx = source.getContext('2d')
    sourceCtx.imageSmoothingEnabled = false
    sourceCtx.drawImage(photo, 0, 0)
    expect(rgba(ctx, 12, 12)).toEqual(rgba(sourceCtx, 12, 102))
  })

  it('draws the white status card on top of the photo', async () => {
    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext('2d')
    await paintOuterBackground(
      ctx,
      { kind: 'image', src: 'backgrounds/shibuya-pink.jpg' },
      200,
      200,
      loadBundled,
    )
    const card = createCanvas(200, 40)
    const cardCtx = card.getContext('2d')
    cardCtx.fillStyle = '#ffffff'
    cardCtx.fillRect(0, 0, 200, 40)
    drawStatusCard(ctx, card, 200, 200)
    expect(rgba(ctx, 4, 4)[0]).not.toBe(255)
    expect(rgba(ctx, 20, 100)).toEqual([255, 255, 255, 255])
  })
})

describe('bundled photo presets', () => {
  it('lists the six Chinese labels beside the solid and gradient presets', () => {
    expect(BACKGROUND_PRESETS.map((preset) => preset.id)).toEqual([
      'white',
      'xgray',
      'xblue',
      'ink',
      ...PHOTO_PRESETS.map((preset) => preset.id),
    ])
    expect(
      BACKGROUND_PRESETS.filter((preset) => preset.background.kind === 'image'),
    ).toEqual(
      PHOTO_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        background: { kind: 'image', src: preset.file },
      })),
    )
  })

  it('ships each photo at 1080×1620 and rejects other paths', async () => {
    for (const file of BUNDLED_BACKGROUND_FILES) {
      const img = await loadImage(bundledBackgroundFilePath(file))
      expect(img.width).toBe(1080)
      expect(img.height).toBe(1620)
    }
    expect(() =>
      bundledBackgroundFilePath('https://images.unsplash.com/photo.jpg' as never),
    ).toThrow(/unknown background/)
  })
})
