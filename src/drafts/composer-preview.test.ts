/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openCardOverlay } from '../content/overlay'
import { renderCardPng } from '../render/card'

vi.mock('../render/card', () => ({ renderCardPng: vi.fn() }))

const sendMessage = vi.fn(async () => ({ ok: true, jobs: [] }))

beforeEach(() => {
  sendMessage.mockClear()
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
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
  root.querySelector<HTMLInputElement>('#hideHandle')!.click()
  expect(save.disabled).toBe(true)
  expect(download.disabled).toBe(true)
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  expect(sendMessage.mock.calls).not.toContainEqual([expect.objectContaining({ type: 'DRAFT_CREATE' })])
  finishRender(new Uint8Array([4, 5, 6]))
  await vi.waitFor(() => expect(save.disabled).toBe(false))
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'DRAFT_CREATE', input: expect.objectContaining({ bytes: [4, 5, 6] }) }))
})
