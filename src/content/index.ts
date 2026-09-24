import type { KatieMessage } from '../types'
import { openCardOverlay } from './overlay'
import { articleStatusUrl, scrapeArticle, scrapePostText } from './scrape'
import { startShareMenuInjector } from './share-menu'

chrome.runtime.onMessage.addListener((message: KatieMessage, _sender, sendResponse) => {
  if (message.type === 'OPEN_CARD_OVERLAY') {
    openCardOverlay(scrapePostText())
    sendResponse({ ok: true })
    return false
  }
  return false
})

startShareMenuInjector(document, (article) => {
  const result = scrapeArticle(article, articleStatusUrl(article, location.href))
  openCardOverlay(result)
})
