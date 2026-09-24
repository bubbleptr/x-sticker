/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openCardOverlay } from '../content/overlay'
import { renderCardPng } from '../render/card'
import type { DraftMessage, DraftResponse } from './types'
import { mockSuccessfulBrowserImages } from '../render/test-browser-images'

vi.mock('../render/card', () => ({ renderCardPng: vi.fn() }))

const sendMessage = vi.fn<(message: DraftMessage) => Promise<DraftResponse>>(async () => ({ ok: true, jobs: [] }))

beforeEach(() => {
  mockSuccessfulBrowserImages()
  sendMessage.mockReset().mockResolvedValue({ ok: true, jobs: [] })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
})

it('dedicates the sheet to progress after syncing and returns to the same editable preview without another upload', async () => {
  vi.mocked(renderCardPng).mockResolvedValue(new Uint8Array([1, 2, 3]))
  openCardOverlay({ ok: true, post: { text: '预览优先', postUrl: 'https://x.com/example/status/1' } })
  const root = document.getElementById('katie-card-overlay')!.shadowRoot!
  const workspace = root.querySelector<HTMLElement>('.workspace')!
  const save = root.querySelector<HTMLButtonElement>('button[type=submit]')!
  await vi.waitFor(() => expect(save.disabled).toBe(false))
  const title = root.querySelector<HTMLInputElement>('input[name=title]')!
  title.value = '保留这个标题'
  title.dispatchEvent(new Event('input', { bubbles: true }))
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  expect(workspace.hidden).toBe(true)
  const progress = root.querySelector<HTMLElement>('#draftProgress')!
  expect(progress.hidden).toBe(false)
  progress.querySelector<HTMLButtonElement>('.draft-back')!.click()
  expect(workspace.hidden).toBe(false)
  expect(progress.hidden).toBe(true)
  expect(title.value).toBe('保留这个标题')
  expect(sendMessage.mock.calls.filter(([message]) => message.type === 'DRAFT_CREATE')).toHaveLength(1)
})

afterEach(() => {
  document.getElementById('katie-card-overlay')?.shadowRoot?.querySelector<HTMLButtonElement>('#close')?.click()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('invalidates both actions immediately after changing image options and submits only the replacement image', async () => {
  let finishRender!: (bytes: Uint8Array) => void
  vi.mocked(renderCardPng)
    .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    .mockImplementationOnce(() => new Promise((resolve) => { finishRender = resolve }))
  openCardOverlay({ ok: true, post: { text: '待保存的贴图', postUrl: 'https://x.com/example/status/1' } })
  const root = document.getElementById('katie-card-overlay')!.shadowRoot!
  const save = root.querySelector<HTMLButtonElement>('button[type=submit]')!
  const download = root.querySelector<HTMLButtonElement>('#download')!
  const form = root.querySelector('form')!
  await vi.waitFor(() => expect(save.disabled).toBe(false))
  root.querySelector<HTMLInputElement>('#showHandle')!.click()
  expect(save.disabled).toBe(true)
  expect(download.disabled).toBe(true)
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  expect(sendMessage.mock.calls).not.toContainEqual([expect.objectContaining({ type: 'DRAFT_CREATE' })])
  finishRender(new Uint8Array([4, 5, 6]))
  await vi.waitFor(() => expect(save.disabled).toBe(false))
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'DRAFT_CREATE', input: expect.objectContaining({ images: [expect.objectContaining({ dataUrl: 'data:image/png;base64,BAUG' })] }) }))
})
