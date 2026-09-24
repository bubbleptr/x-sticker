import type { KatieMessage } from '../types'
import { pngBytesToDataUrl } from './png-data-url'

chrome.runtime.onMessage.addListener((message: KatieMessage, _sender, sendResponse) => {
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
