/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openCardOverlay } from './overlay'
import { CHROME_RADIUS } from '../ui/chromeRadius'
import { renderCardPng } from '../render/card'
import { buildStatusArticleHtml } from '../render/statusHtml'
import { mockSuccessfulBrowserImages } from '../render/test-browser-images'

vi.mock('../render/card', () => ({ renderCardPng: vi.fn() }))

let stored: Record<string, unknown>
const get = vi.fn()
const set = vi.fn()
const sendMessage = vi.fn()

function open(text = '当前帖子', authorDisplayName = '作者') {
  openCardOverlay({ ok: true, post: { text, handle: 'example', authorDisplayName, postUrl: `https://x.com/example/status/${text}` } })
  return document.getElementById('katie-card-overlay')!.shadowRoot!
}

function close() {
  document.getElementById('katie-card-overlay')?.shadowRoot?.querySelector<HTMLButtonElement>('#close')?.click()
}

beforeEach(() => {
  mockSuccessfulBrowserImages()
  stored = {}
  get.mockReset().mockImplementation(async () => structuredClone(stored))
  set.mockReset().mockImplementation(async (values) => { Object.assign(stored, structuredClone(values)) })
  sendMessage.mockReset().mockResolvedValue({ ok: true, jobs: [] })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: { local: { get, set }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  })
  vi.mocked(renderCardPng).mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
})

afterEach(() => {
  close()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('uses positive display controls and restores Inspector selections when another post opens', async () => {
  let root = open()
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalled())
  expect(vi.mocked(renderCardPng).mock.lastCall?.[1]).toMatchObject({ hideHandle: false, showAuthor: true })
  const showHandle = root.querySelector<HTMLInputElement>('#showHandle')!
  const showAuthor = root.querySelector<HTMLInputElement>('#showAuthor')!
  expect(showHandle.checked).toBe(true)
  expect(showAuthor.checked).toBe(true)
  showHandle.click()
  showAuthor.click()
  root.querySelector<HTMLInputElement>('input[name=aspect][value="9:16"]')!.click()
  Array.from(root.querySelectorAll<HTMLButtonElement>('.preset')).find((button) => button.textContent === '香港')!.click()
  root.querySelector<HTMLInputElement>('input[name=platform][value=xiaohongshu]')!.click()
  root.querySelector<HTMLInputElement>('input[name=platform][value=douyin]')!.click()
  root.querySelector<HTMLInputElement>('input[name=title]')!.value = '上一帖的标题'
  await vi.waitFor(() => expect(set).toHaveBeenCalled())
  close()
  vi.mocked(renderCardPng).mockClear()
  root = open('下一条帖子')
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalled())
  expect(vi.mocked(renderCardPng).mock.lastCall?.[1]).toMatchObject({
    hideHandle: true, showAuthor: false, aspect: '9:16',
    background: { kind: 'image', src: 'backgrounds/hk-harbor.jpg' },
  })
  expect(root.querySelector<HTMLInputElement>('#showHandle')!.checked).toBe(false)
  expect(root.querySelector<HTMLInputElement>('#showAuthor')!.checked).toBe(false)
  expect(root.querySelector<HTMLInputElement>('input[name=platform][value=xiaohongshu]')!.checked).toBe(false)
  expect(root.querySelector<HTMLInputElement>('input[name=platform][value=douyin]')!.checked).toBe(true)
  expect(root.querySelector<HTMLInputElement>('input[name=title]')!.value).toBe('下一条帖子')
  expect(sendMessage.mock.calls.some(([message]) => message.type === 'DRAFT_CREATE')).toBe(false)
})

it('waits for saved preferences before rendering and ignores a closed overlay', async () => {
  let resolveRead!: (stored: Record<string, unknown>) => void
  get.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
  const oldRoot = open('已关闭的帖子')
  expect(oldRoot.querySelector('.inspector')!.hasAttribute('inert')).toBe(true)
  expect(renderCardPng).not.toHaveBeenCalled()
  close()
  const root = open('新帖子')
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  resolveRead({})
  await Promise.resolve()
  await Promise.resolve()
  expect(renderCardPng).toHaveBeenCalledTimes(1)
  expect(root.querySelector('.inspector')!.hasAttribute('inert')).toBe(false)
  expect(vi.mocked(renderCardPng).mock.lastCall?.[0].text).toBe('新帖子')
})

it('keeps the preview usable and reports when preferences cannot be read or saved', async () => {
  get.mockRejectedValueOnce(new Error('Storage unavailable'))
  set.mockRejectedValueOnce(new Error('Storage unavailable'))
  const root = open()
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  const message = root.querySelector<HTMLElement>('#preferencesStatus')!
  expect(message.hidden).toBe(false)
  expect(message.textContent).toContain('偏好读取失败')
  expect(root.querySelector('.inspector')!.hasAttribute('inert')).toBe(false)
  root.querySelector<HTMLInputElement>('#showHandle')!.click()
  await vi.waitFor(() => expect(message.textContent).toContain('偏好保存失败'))
  expect(vi.mocked(renderCardPng).mock.lastCall?.[1].hideHandle).toBe(true)
})

it('keeps a failed preference warning until that same preference saves successfully', async () => {
  const root = open()
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalled())
  const message = root.querySelector<HTMLElement>('#preferencesStatus')!
  const showHandle = root.querySelector<HTMLInputElement>('#showHandle')!
  set.mockRejectedValueOnce(new Error('Storage unavailable'))
  showHandle.click()
  await vi.waitFor(() => expect(message.hidden).toBe(false))
  root.querySelector<HTMLInputElement>('#showAuthor')!.click()
  await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2))
  await set.mock.results[1]!.value
  await Promise.resolve()
  expect(message.hidden).toBe(false)
  showHandle.click()
  await vi.waitFor(() => expect(message.hidden).toBe(true))
})

it('renders and remembers a custom name, then restores each post author when cleared', async () => {
  let root = open()
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalled())
  const originalPost = vi.mocked(renderCardPng).mock.lastCall![0]
  const input = root.querySelector<HTMLInputElement>('#customName')
  expect(input).not.toBeNull()
  input!.value = '我的名字'
  input!.dispatchEvent(new Event('input', { bubbles: true }))
  expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(true)
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  await vi.waitFor(() => expect(vi.mocked(renderCardPng).mock.lastCall?.[0].authorDisplayName).toBe('我的名字'))
  expect(originalPost.authorDisplayName).toBe('作者')
  close()
  vi.mocked(renderCardPng).mockClear()
  root = open('下一条帖子', '另一位作者')
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  expect(root.querySelector<HTMLInputElement>('#customName')!.value).toBe('我的名字')
  expect(vi.mocked(renderCardPng).mock.lastCall?.[0]).toMatchObject({ authorDisplayName: '我的名字', handle: 'example', text: '下一条帖子' })
  root.querySelector<HTMLInputElement>('#showAuthor')!.click()
  const hiddenCall = vi.mocked(renderCardPng).mock.lastCall!
  const hidden = new DOMParser().parseFromString(buildStatusArticleHtml(hiddenCall[0], hiddenCall[1]), 'text/html')
  expect(hidden.querySelector('.name-row')!.textContent).not.toContain('我的名字')
  expect(root.querySelector<HTMLInputElement>('#customName')!.disabled).toBe(true)
  root.querySelector<HTMLInputElement>('#showAuthor')!.click()
  expect(root.querySelector<HTMLInputElement>('#customName')!.disabled).toBe(false)
  expect(root.querySelector<HTMLInputElement>('#customName')!.value).toBe('我的名字')
  const restoredInput = root.querySelector<HTMLInputElement>('#customName')!
  restoredInput.value = '   '
  restoredInput.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(vi.mocked(renderCardPng).mock.lastCall?.[0].authorDisplayName).toBe('另一位作者'))
  close()
  vi.mocked(renderCardPng).mockClear()
  root = open('再下一条帖子', '第三位作者')
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  expect(vi.mocked(renderCardPng).mock.lastCall?.[0].authorDisplayName).toBe('第三位作者')
})

it('coalesces name edits, rejects an older image, and cancels pending rendering on close', async () => {
  let finishOriginal!: (bytes: Uint8Array) => void
  vi.mocked(renderCardPng).mockImplementationOnce(() => new Promise((resolve) => { finishOriginal = resolve }))
  const root = open()
  await vi.waitFor(() => expect(renderCardPng).toHaveBeenCalledTimes(1))
  vi.useFakeTimers()
  const input = root.querySelector<HTMLInputElement>('#customName')!
  for (const name of ['自', '自定', '自定义名字']) {
    input.value = name
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  finishOriginal(new Uint8Array([9, 9, 9]))
  await Promise.resolve()
  expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(true)
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  await vi.runOnlyPendingTimersAsync()
  expect(renderCardPng).toHaveBeenCalledTimes(2)
  expect(vi.mocked(renderCardPng).mock.lastCall?.[0].authorDisplayName).toBe('自定义名字')
  expect(root.querySelector<HTMLButtonElement>('#download')!.disabled).toBe(false)
  input.value = '关闭前的修改'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  close()
  await vi.runOnlyPendingTimersAsync()
  expect(renderCardPng).toHaveBeenCalledTimes(2)
})

it('applies the shared radius scale to the overlay shell and inspector chrome', () => {
  const root = open()
  const css = Array.from(root.querySelectorAll('style'), (style) => style.textContent ?? '').join('\n')
  for (const [token, value] of Object.entries(CHROME_RADIUS)) {
    expect(css).toContain(`--radius-${token}: ${value}`)
    expect(css).toContain(`var(--radius-${token}, ${value})`)
  }
  expect(css).toContain('.sheet')
  expect(css).toContain('.draft-platform')
})
