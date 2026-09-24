import type { KatieMessage } from '../types'
import { pngBytesToDataUrl } from './png-data-url'
import { createDraftService } from '../drafts/service'
import { createDraftRepository } from '../drafts/store'
import type { DraftMessage } from '../drafts/types'
import { registerXAction } from './action'
import { createPhotoLoader } from './photo-loader'
import { createImageDownload } from './image-download'

registerXAction()
const loadPhoto = createPhotoLoader()
const downloadImages = createImageDownload((options) => chrome.downloads.download(options))

function assertXSender(sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.url) throw new Error('请从 X/Twitter 的卡贴预览操作图片')
  const origin = new URL(sender.url).origin
  if (!['https://x.com', 'https://twitter.com'].includes(origin) || (sender.origin && sender.origin !== origin)) throw new Error('图片操作来源无效')
}

const drafts = createDraftService({
  repository: createDraftRepository(),
  extensionId: chrome.runtime.id,
  tabs: {
    async createBlank() {
      const tab = await chrome.tabs.create({ url: 'about:blank', active: false })
      if (tab.id === undefined) throw new Error('无法创建草稿标签页')
      return tab.id
    },
    async navigate(tabId, url) { await chrome.tabs.update(tabId, { url }) },
    async control(tabId, command) { return chrome.tabs.sendMessage(tabId, command, { frameId: 0 }) },
    async focus(tabId) {
      const tab = await chrome.tabs.get(tabId)
      await chrome.tabs.update(tabId, { active: true })
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })
    },
  },
})

chrome.tabs.onRemoved.addListener((tabId) => { void drafts.tabClosed(tabId).catch(console.error) })
chrome.runtime.onStartup.addListener(() => { void drafts.browserRestarted().catch(console.error) })

chrome.runtime.onMessage.addListener((message: KatieMessage | DraftMessage, sender, sendResponse) => {
  if (message?.type === 'LOAD_POST_PHOTO' || message?.type === 'DOWNLOAD_IMAGES') {
    void (async () => {
      try {
        assertXSender(sender)
        if (message.type === 'LOAD_POST_PHOTO') {
          const image = await loadPhoto(message.url, message.filenameStem)
          sendResponse({ ok: true, image })
        } else {
          await downloadImages(message.images, message.filename)
          sendResponse({ type: 'DOWNLOAD_OK' })
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : '图片操作失败'
        sendResponse(message.type === 'LOAD_POST_PHOTO' ? { ok: false, error: detail } : { type: 'DOWNLOAD_ERR', message: detail })
      }
    })()
    return true
  }
  if (typeof message?.type === 'string' && message.type.startsWith('DRAFT_')) {
    void drafts.handle(message as DraftMessage, sender).then(sendResponse)
    return true
  }
  if (message.type !== 'DOWNLOAD_PNG') return false

  const url = pngBytesToDataUrl(Uint8Array.from(message.bytes))
  chrome.downloads.download(
    {
      url,
      filename: message.filename,
      saveAs: false,
    },
    (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        sendResponse({
          type: 'DOWNLOAD_ERR',
          message: chrome.runtime.lastError?.message ?? 'download failed',
        } satisfies KatieMessage)
      } else {
        sendResponse({ type: 'DOWNLOAD_OK' } satisfies KatieMessage)
      }
    },
  )

  return true
})
