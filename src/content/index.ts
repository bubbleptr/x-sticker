import { scrapePostText } from './scrape'
import type { KatieMessage } from '../types'

chrome.runtime.onMessage.addListener((message: KatieMessage, _sender, sendResponse) => {
  if (message.type !== 'SCRAPE_POST') return false
  const result = scrapePostText()
  sendResponse({ type: 'SCRAPE_RESULT', result } satisfies KatieMessage)
  return false
})
