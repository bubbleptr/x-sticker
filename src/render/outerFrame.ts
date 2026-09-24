import type { Background } from '../types'
import { isBundledBackgroundFile, type BundledBackgroundFile } from '../photoBackgrounds'

type Sized = { width: number; height: number }

type FrameContext<TImage extends Sized> = {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(offset: number, color: string): void }
  drawImage(image: TImage, dx: number, dy: number, dw: number, dh: number): void
}

/** Destination rect that cover-fills `box` with `img` (offsets may be negative). */
export function coverDestRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    throw new Error('background cover needs positive dimensions')
  }
  const scale = Math.max(boxW / imgW, boxH / imgH)
  const dw = imgW * scale
  const dh = imgH * scale
  return {
    dx: (boxW - dw) / 2,
    dy: (boxH - dh) / 2,
    dw,
    dh,
  }
}

export async function paintOuterBackground<TImage extends Sized>(
  ctx: FrameContext<TImage>,
  background: Background,
  width: number,
  height: number,
  loadImage: (src: BundledBackgroundFile) => Promise<TImage>,
): Promise<void> {
  if (background.kind === 'solid') {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (background.kind === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, background.from)
    gradient.addColorStop(1, background.to)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (!isBundledBackgroundFile(background.src)) {
    throw new Error(`unknown background: ${background.src}`)
  }
  const img = await loadImage(background.src)
  const { dx, dy, dw, dh } = coverDestRect(img.width, img.height, width, height)
  ctx.drawImage(img, dx, dy, dw, dh)
}

/** Full-width white status card, vertically centered on the outer frame. */
export function drawStatusCard<TImage extends Sized>(
  ctx: { drawImage(image: TImage, dx: number, dy: number, dw: number, dh: number): void },
  img: TImage,
  outW: number,
  outH: number,
): void {
  const drawW = outW
  const drawH = Math.round((img.height / img.width) * drawW)
  const y = Math.max(0, Math.round((outH - drawH) / 2))
  ctx.drawImage(img, 0, y, drawW, Math.min(drawH, outH))
}
