import type { KatieMessage } from '../types'

export function registerXAction(): void {
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.action.disable()
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
      chrome.declarativeContent.onPageChanged.addRules([{
        conditions: ['x.com', 'twitter.com'].map((hostEquals) => new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { schemes: ['https'], hostEquals },
        })),
        actions: [new chrome.declarativeContent.ShowAction()],
      }])
    })
  })
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined || !tab.url) return
    const origin = new URL(tab.url).origin
    if (origin !== 'https://x.com' && origin !== 'https://twitter.com') return
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CARD_OVERLAY' } satisfies KatieMessage)
      await chrome.action.setTitle({ tabId: tab.id, title: 'X Sticker' })
    } catch {
      await chrome.action.setTitle({ tabId: tab.id, title: '请刷新 X / Twitter 页面后重试' })
    }
  })
}
