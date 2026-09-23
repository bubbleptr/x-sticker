import type { KatieMessage } from '../types'

chrome.runtime.onMessage.addListener((message: KatieMessage, _sender, sendResponse) => {
  if (message.type !== 'DOWNLOAD_PNG') return false

  const bytes = Uint8Array.from(message.bytes)
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const blob = new Blob([ab], { type: 'image/png' })
  const url = URL.createObjectURL(blob)

  chrome.downloads.download(
    {
      url,
      filename: message.filename,
      saveAs: true,
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
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
  )

  return true
})
