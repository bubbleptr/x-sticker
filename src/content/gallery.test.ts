/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openCardOverlay } from './overlay'
import { renderCardPng, renderCardWithPhotoPng } from '../render/card'
import type { ImageAsset } from '../media'
import { mockSuccessfulBrowserImages } from '../render/test-browser-images'

vi.mock('../render/card', () => ({ renderCardPng: vi.fn(), renderCardWithPhotoPng: vi.fn() }))
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='
const photo: ImageAsset = { filename: 'photo.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${png}` }
const send = vi.fn()
const photos = [1, 2].map((number) => ({ url: `https://pbs.twimg.com/media/photo${number}?format=png&name=orig` }))
function open(text = '图文内容') {
  openCardOverlay({ ok: true, post: { text, photos, postUrl: 'https://x.com/example/status/123' } })
  return document.getElementById('katie-card-overlay')!.shadowRoot!
}
beforeEach(() => {
  mockSuccessfulBrowserImages()
  send.mockReset().mockImplementation(async (message) => message.type === 'LOAD_POST_PHOTO' ? { ok: true, image: photo } : message.type === 'DOWNLOAD_IMAGES' ? { type: 'DOWNLOAD_OK' } : { ok: true, jobs: [] })
  vi.stubGlobal('chrome', { runtime: { sendMessage: send }, storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } })
  vi.mocked(renderCardPng).mockReset().mockResolvedValue(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)))
  vi.mocked(renderCardWithPhotoPng).mockReset().mockResolvedValue(null)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
})
afterEach(() => {
  document.getElementById('katie-card-overlay')?.shadowRoot?.querySelector<HTMLButtonElement>('#close')?.click()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('shows a fixed cover followed by ordered photos and exports only selected photos', async () => {
  const root = open()
  expect(root.querySelectorAll('.gallery-page')).toHaveLength(3)
  const download = root.querySelector<HTMLButtonElement>('#download')!
  await vi.waitFor(() => expect(download.disabled).toBe(false))
  root.querySelector<HTMLInputElement>('[data-page-id="photo-0"] input')!.click()
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-1"] .thumbnail')!.click()
  expect(root.querySelector('[data-page-id="photo-1"] .thumbnail')!.getAttribute('aria-pressed')).toBe('true')
  // Excluding the first photo re-evaluates the cover, which may have held it.
  await vi.waitFor(() => expect(download.disabled).toBe(false))
  download.click()
  await vi.waitFor(() => expect(send.mock.calls.some(([message]) => message.type === 'DOWNLOAD_IMAGES')).toBe(true))
  const exported = send.mock.calls.find(([message]) => message.type === 'DOWNLOAD_IMAGES')![0].images as ImageAsset[]
  expect(exported.map((image) => image.filename)).toEqual(['01-cover.png', '02-photo.png'])
  expect(exported[1]!.dataUrl).toBe(photo.dataUrl)
  expect(vi.mocked(renderCardPng)).toHaveBeenCalledTimes(2)
})

const exportedNames = async (root: ShadowRoot) => {
  send.mockClear()
  root.querySelector<HTMLButtonElement>('#download')!.click()
  await vi.waitFor(() => expect(send.mock.calls.some(([message]) => message.type === 'DOWNLOAD_IMAGES')).toBe(true))
  return (send.mock.calls.find(([message]) => message.type === 'DOWNLOAD_IMAGES')![0].images as ImageAsset[]).map((image) => image.filename)
}

it('puts the first photo inside a short cover and stops exporting it separately', async () => {
  vi.mocked(renderCardWithPhotoPng).mockResolvedValue(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)))
  const root = open()
  const download = root.querySelector<HTMLButtonElement>('#download')!
  await vi.waitFor(() => expect(download.disabled).toBe(false))
  expect(vi.mocked(renderCardWithPhotoPng).mock.lastCall?.[2]).toBe(photo.dataUrl)
  expect(renderCardPng).not.toHaveBeenCalled()
  expect(await exportedNames(root)).toEqual(['01-cover.png', '02-photo.png'])

  // Unchecking the merged photo removes it from the cover instead of hiding it silently.
  root.querySelector<HTMLInputElement>('[data-page-id="photo-0"] input')!.click()
  expect(download.disabled).toBe(true)
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(download.disabled).toBe(false))
  expect(await exportedNames(root)).toEqual(['01-cover.png', '02-photo.png'])
})

it('keeps the first photo as its own page when text and photo do not fit one cover', async () => {
  const root = open('很长的文字')
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(false))
  expect(renderCardWithPhotoPng).toHaveBeenCalledTimes(1)
  expect(renderCardPng).toHaveBeenCalledTimes(1)
  expect(await exportedNames(root)).toEqual(['01-cover.png', '02-photo.png', '03-photo.png'])
})

it('falls back to a text cover when the first photo fails to load', async () => {
  send.mockImplementation(async (message) => message.type === 'LOAD_POST_PHOTO'
    ? message.url === photos[0]!.url ? { ok: false, error: '图片请求超时' } : { ok: true, image: photo }
    : { ok: true, jobs: [] })
  const root = open()
  await vi.waitFor(() => expect(root.querySelector('#status')!.textContent).toContain('配图 1加载失败'))
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  expect(renderCardWithPhotoPng).not.toHaveBeenCalled()
})

it('keeps a selected photo failure visible and blocks both outputs until it is retried or excluded', async () => {
  let retry = false
  send.mockImplementation(async (message) => {
    if (message.type === 'LOAD_POST_PHOTO') return message.url === photos[1]!.url && !retry ? { ok: false, error: '图片请求超时' } : { ok: true, image: photo }
    return { ok: true, jobs: [] }
  })
  const root = open()
  const download = root.querySelector<HTMLButtonElement>('#download')!
  const submit = root.querySelector<HTMLButtonElement>('button[type=submit]')!
  await vi.waitFor(() => expect(root.querySelector('#status')!.textContent).toContain('配图 2加载失败'))
  expect(download.disabled).toBe(true)
  expect(submit.disabled).toBe(true)
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-1"] .thumbnail')!.click()
  expect(root.querySelector('#previewMessage')!.textContent).toBe('图片请求超时')
  expect(root.querySelector<HTMLCanvasElement>('#preview')!.hidden).toBe(true)
  root.querySelector<HTMLInputElement>('[data-page-id="photo-1"] input')!.click()
  expect(download.disabled).toBe(false)
  root.querySelector<HTMLInputElement>('[data-page-id="photo-1"] input')!.click()
  retry = true
  root.querySelector<HTMLButtonElement>('#retryImage')!.click()
  await vi.waitFor(() => expect(download.disabled).toBe(false))
  expect(submit.disabled).toBe(false)
})

it('allows pure-photo posts without a blank cover and requires at least one selected image', async () => {
  const root = open('')
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(false))
  expect(renderCardPng).not.toHaveBeenCalled()
  expect(root.querySelectorAll('.gallery-page')).toHaveLength(2)
  expect(root.querySelector<HTMLElement>('.appearance')!.hidden).toBe(true)
  expect(root.querySelector<HTMLInputElement>('input[name=title]')!.value).toBe('图片分享')
  for (const checkbox of root.querySelectorAll<HTMLInputElement>('.gallery input')) checkbox.click()
  expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(true)
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  root.querySelector<HTMLInputElement>('[data-page-id="photo-1"] input')!.click()
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  const created = send.mock.calls.find(([message]) => message.type === 'DRAFT_CREATE')![0]
  expect(created.input.images).toEqual([{ ...photo, filename: '01-photo.png' }])
  expect(created.input.body).toBe('')
})

it('does not steal the viewed photo or reset a completed submission when another preview is selected', async () => {
  let finish!: (response: unknown) => void
  send.mockImplementation(async (message) => {
    if (message.type === 'LOAD_POST_PHOTO' && message.url === photos[1]!.url) return new Promise((resolve) => { finish = resolve })
    if (message.type === 'LOAD_POST_PHOTO') return { ok: true, image: photo }
    if (message.type === 'DRAFT_CREATE') return { ok: true, jobs: [{ id: 'job', platform: 'xiaohongshu', status: 'queued', step: 'opening', title: '图文内容', createdAt: 1, updatedAt: 1, message: '正在打开' }] }
    return { ok: true, jobs: [] }
  })
  const root = open()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-0"] .thumbnail')!.click()
  finish({ ok: true, image: photo })
  await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(false))
  expect(root.querySelector('[data-page-id="photo-0"] .thumbnail')!.getAttribute('aria-pressed')).toBe('true')
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(root.querySelector('button[type=submit]')!.textContent).toBe('已加入同步'))
  root.querySelector<HTMLButtonElement>('.draft-back')!.click()
  root.querySelector<HTMLButtonElement>('[data-page-id="photo-1"] .thumbnail')!.click()
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  expect(send.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')).toHaveLength(1)
})
