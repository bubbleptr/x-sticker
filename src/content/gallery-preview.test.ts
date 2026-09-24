/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openCardOverlay } from './overlay'
import { renderCardPng } from '../render/card'

vi.mock('../render/card', () => ({ renderCardPng: vi.fn() }))
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='
const image = { filename: 'photo.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${png}` }
const loads: ControlledImage[] = []
class ControlledImage {
  src = ''
  naturalWidth = 1
  naturalHeight = 1
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { loads.push(this) }
  decode() { return Promise.resolve() }
  removeAttribute() { this.src = '' }
}
const pendingPaints = () => loads.filter((image) => image.onload !== null)
beforeEach(() => {
  loads.length = 0
  vi.stubGlobal('Image', ControlledImage)
  vi.stubGlobal('chrome', { runtime: { sendMessage: async (message: { type: string }) => message.type === 'LOAD_POST_PHOTO' ? { ok: true, image } : { ok: true, jobs: [] } }, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } })
  vi.mocked(renderCardPng).mockReset().mockResolvedValue(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  document.getElementById('katie-card-overlay')?.shadowRoot?.querySelector<HTMLButtonElement>('#close')?.click()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('hides the previous bitmap while a newly selected photo is painting and reports paint failure with retry', async () => {
  openCardOverlay({ ok: true, post: { text: '文字封面', photos: [{ url: 'https://pbs.twimg.com/media/photo?format=png&name=orig' }], postUrl: 'https://x.com/example/status/123' } })
  const root = document.getElementById('katie-card-overlay')!.shadowRoot!
  const canvas = root.querySelector<HTMLCanvasElement>('#preview')!
  await vi.waitFor(() => expect(pendingPaints()).toHaveLength(1))
  pendingPaints()[0]!.onload!()
  await vi.waitFor(() => expect(canvas.hidden).toBe(false))
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-0"] .thumbnail')!.click()
  expect(root.querySelector('#previewLabel')!.textContent).toContain('配图 1')
  expect(canvas.hidden).toBe(true)
  expect(root.querySelector('#previewMessage')!.textContent).toContain('加载')
  const pendingPhoto = pendingPaints().at(-1)!
  const latePhotoLoad = pendingPhoto.onload!
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-0"] .thumbnail')!.click()
  expect(pendingPaints()).toEqual([pendingPhoto])
  root.querySelector<HTMLButtonElement>('[data-page-id="cover"] .thumbnail')!.click()
  expect(canvas.hidden).toBe(true)
  latePhotoLoad()
  expect(canvas.hidden).toBe(true)
  pendingPaints().at(-1)!.onload!()
  await vi.waitFor(() => expect(canvas.hidden).toBe(false))
  expect(root.querySelector('#previewLabel')!.textContent).toContain('文字封面')
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-0"] .thumbnail')!.click()
  const photoPaint = pendingPaints().at(-1)!
  photoPaint.onerror!()
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('#retryImage')!.hidden).toBe(false))
  expect(canvas.hidden).toBe(true)
  expect(root.querySelector('#previewMessage')!.textContent).toContain('失败')
  root.querySelector<HTMLButtonElement>('#retryImage')!.click()
  await vi.waitFor(() => expect(pendingPaints()).toHaveLength(1))
  expect(pendingPaints()[0]).not.toBe(photoPaint)
  pendingPaints().at(-1)!.onload!()
  await vi.waitFor(() => expect(canvas.hidden).toBe(false))
  root.querySelector<HTMLButtonElement>('[data-page-id="cover"] .thumbnail')!.click()
  const lateCoverLoad = pendingPaints().at(-1)!.onload!
  root.querySelector<HTMLButtonElement>('#close')!.click()
  lateCoverLoad()
  expect(document.getElementById('katie-card-overlay')).toBeNull()
  expect(pendingPaints()).toHaveLength(0)
})
