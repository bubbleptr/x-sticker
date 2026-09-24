import { afterEach, expect, it, vi } from 'vitest'
import { registerXAction } from './action'

const postMessage = { type: 'OPEN_CARD_OVERLAY' }

afterEach(() => vi.unstubAllGlobals())

it('opens the in-page editor only for an HTTPS X or Twitter tab', async () => {
  let click!: (tab: chrome.tabs.Tab) => Promise<void>
  const sendMessage = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', {
    runtime: { onInstalled: { addListener: vi.fn() } },
    action: { onClicked: { addListener: (listener: typeof click) => { click = listener } }, setTitle: vi.fn(async () => undefined) },
    tabs: { sendMessage },
  })
  registerXAction()
  for (const url of ['https://creator.douyin.com/', 'https://creator.xiaohongshu.com/', 'https://example.com/', 'https://x.com.evil.test/', 'http://x.com/', 'chrome://newtab/', undefined]) {
    await click({ id: 42, url } as chrome.tabs.Tab)
  }
  expect(sendMessage).not.toHaveBeenCalled()
  for (const url of ['https://x.com/user/status/1', 'https://twitter.com/home']) {
    await click({ id: 42, url } as chrome.tabs.Tab)
  }
  expect(sendMessage.mock.calls).toEqual([[42, postMessage], [42, postMessage]])
})

it('makes a stale X tab recoverable by asking for a refresh in the action title', async () => {
  let click!: (tab: chrome.tabs.Tab) => Promise<void>
  const setTitle = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', {
    runtime: { onInstalled: { addListener: vi.fn() } },
    action: { onClicked: { addListener: (listener: typeof click) => { click = listener } }, setTitle },
    tabs: { sendMessage: vi.fn(async () => { throw new Error('No receiver') }) },
  })
  registerXAction()
  await click({ id: 42, url: 'https://x.com/home' } as chrome.tabs.Tab)
  expect(setTitle).toHaveBeenCalledWith({ tabId: 42, title: expect.stringContaining('刷新') })
})
