import type { PostText, ScrapeResult } from '../types'

const STATUS_RE = /\/status\/(\d+)/

function normalizeHandle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().replace(/^@+/, '')
  return trimmed.length > 0 ? trimmed : undefined
}

function statusIdFromUrl(url: string): string | undefined {
  const m = url.match(STATUS_RE)
  return m?.[1]
}

function isPromoted(article: Element): boolean {
  const text = article.textContent ?? ''
  return /Promoted|Ad|推广|广告/.test(text) && !!article.querySelector('[data-testid="placementTracking"]')
}

function extractTweetText(article: Element): string {
  const textRoot = article.querySelector('[data-testid="tweetText"]')
  if (!textRoot) return ''

  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      if (t) parts.push(t)
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.tagName === 'IMG' && node.getAttribute('alt')) {
      parts.push(node.getAttribute('alt') ?? '')
      return
    }
    if (node.tagName === 'BR') {
      parts.push('\n')
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(textRoot)
  return parts.join('').replace(/\u00a0/g, ' ').trim()
}

function extractAuthor(article: Element): {
  authorDisplayName?: string
  handle?: string
  avatarUrl?: string
} {
  const userName = article.querySelector('[data-testid="User-Name"]')
  let authorDisplayName: string | undefined
  let handle: string | undefined

  if (userName) {
    const links = Array.from(userName.querySelectorAll('a[href^="/"]'))
    for (const link of links) {
      const href = link.getAttribute('href') ?? ''
      if (/^\/[^/]+$/.test(href) && !handle) {
        handle = normalizeHandle(href.slice(1))
      }
    }
    const spans = Array.from(userName.querySelectorAll('span'))
    for (const span of spans) {
      const t = span.textContent?.trim() ?? ''
      if (!t || t.startsWith('@') || t === '·') continue
      if (!authorDisplayName) authorDisplayName = t
    }
    if (!handle) {
      const at = spans.find((s) => (s.textContent ?? '').trim().startsWith('@'))
      handle = normalizeHandle(at?.textContent)
    }
  }

  const avatarImg =
    (article.querySelector('[data-testid="Tweet-User-Avatar"] img') as HTMLImageElement | null) ??
    (article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null)
  const avatarUrl = avatarImg?.src || undefined

  return { authorDisplayName, handle, avatarUrl }
}

function extractCreatedAt(article: Element): string | undefined {
  const time = article.querySelector('time')
  const datetime = time?.getAttribute('datetime')
  if (!datetime) return undefined
  const d = new Date(datetime)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function extractPostUrl(article: Element, pageUrl: string): string {
  const statusId = statusIdFromUrl(pageUrl)
  if (statusId) {
    const origin = new URL(pageUrl).origin
    const handleMatch = pageUrl.match(/https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status\//)
    if (handleMatch) return `${origin}/${handleMatch[1]}/status/${statusId}`
  }

  const statusLink = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null
  if (statusLink?.href) return statusLink.href.split('?')[0]

  return pageUrl.split('?')[0]
}

function articleMatchesStatus(article: Element, statusId: string): boolean {
  const links = article.querySelectorAll('a[href*="/status/"]')
  for (const link of Array.from(links)) {
    const href = link.getAttribute('href') ?? ''
    if (href.includes(`/status/${statusId}`)) return true
  }
  return false
}

function pickArticle(doc: Document, pageUrl: string): Element | null {
  const articles = Array.from(doc.querySelectorAll('article[data-testid="tweet"]'))
  const candidates = articles.filter((a) => !isPromoted(a))
  const pool = candidates.length > 0 ? candidates : articles

  const statusId = statusIdFromUrl(pageUrl)
  if (statusId) {
    const matched = pool.find((a) => articleMatchesStatus(a, statusId))
    if (matched) return matched
  }

  return pool[0] ?? null
}

/** Parse/validate at the scrape boundary; never return empty text. */
export function scrapePostText(doc: Document = document, pageUrl: string = location.href): ScrapeResult {
  const article = pickArticle(doc, pageUrl)
  if (!article) return { ok: false, reason: 'no_text_post' }

  const text = extractTweetText(article)
  if (!text) return { ok: false, reason: 'no_text_post' }

  const { authorDisplayName, handle, avatarUrl } = extractAuthor(article)
  const createdAt = extractCreatedAt(article)
  const postUrl = extractPostUrl(article, pageUrl)

  const post: PostText = {
    text,
    postUrl,
    ...(authorDisplayName ? { authorDisplayName } : {}),
    ...(handle ? { handle } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
  }

  return { ok: true, post }
}
