import { afterEach, expect, it, vi } from 'vitest'
import type { KatieMessage } from '../types'

let receive: (message: KatieMessage, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void) => boolean
const validSender = { id: 'extension', url: 'https://x.com/user/status/1', origin: 'https://x.com', frameId: 0 }
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('only lets the top-level X UI request original photos and group downloads', async () => {
  const fetch = vi.fn()
  const download = vi.fn()
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', onMessage: { addListener: (listener: typeof receive) => { receive = listener } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    action: { onClicked: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } }, downloads: { download },
  })
  await import('./sw')
  for (const sender of [ { ...validSender, id: 'another-extension' }, { ...validSender, frameId: 1 }, { ...validSender, url: 'https://x.com.evil.test', origin: 'https://x.com.evil.test' }, { ...validSender, origin: 'null' } ]) {
    for (const message of [ { type: 'LOAD_POST_PHOTO', url: 'https://pbs.twimg.com/media/example?format=png', filenameStem: 'photo' }, { type: 'DOWNLOAD_IMAGES', images: [], filename: 'photos.zip' } ] as KatieMessage[]) {
      const response = vi.fn()
      expect(receive(message, sender, response)).toBe(true)
      await vi.waitFor(() => expect(response).toHaveBeenCalled())
      expect(response.mock.calls[0]![0]).toEqual(expect.objectContaining(message.type === 'LOAD_POST_PHOTO' ? { ok: false } : { type: 'DOWNLOAD_ERR' }))
    }
  }
  expect(fetch).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()
})
