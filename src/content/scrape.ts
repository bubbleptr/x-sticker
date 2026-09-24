import type { PostStats, PostText, PostTextRun, ScrapeResult } from '../types'

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

function queryOwn(article: Element, selector: string): Element | null {
  for (const node of Array.from(article.querySelectorAll(selector))) {
    if (node.closest('article') === article) return node
  }
  return null
}

function isPromoted(article: Element): boolean {
  const text = article.textContent ?? ''
  return /Promoted|Ad|推广|广告/.test(text) && !!article.querySelector('[data-testid="placementTracking"]')
}

function extractTweetText(article: Element): Pick<PostText, 'text' | 'textRuns'> {
  const textRoot = queryOwn(article, '[data-testid="tweetText"]')
  if (!textRoot) return { text: '' }

  const runs: PostTextRun[] = []
  const append = (text: string, bold: boolean) => {
    if (!text) return
    text = text.replace(/\u00a0/g, ' ')
    const previous = runs.at(-1)
    if (previous && Boolean(previous.bold) === bold) previous.text += text
    else runs.push({ text, ...(bold ? { bold: true } : {}) })
  }
  const walk = (node: Node, inheritedBold = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent ?? '', inheritedBold)
      return
    }
    if (!(node instanceof HTMLElement)) return
    const weight = node.ownerDocument.defaultView?.getComputedStyle(node).fontWeight
    const bold = weight
      ? weight === 'bold' || weight === 'bolder' || Number(weight) >= 600
      : inheritedBold || node.tagName === 'B' || node.tagName === 'STRONG'
    if (node.tagName === 'IMG' && node.getAttribute('alt')) {
      append(node.getAttribute('alt') ?? '', bold)
      return
    }
    if (node.tagName === 'BR') {
      append('\n', bold)
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child, bold)
  }
  walk(textRoot)
  while (runs.length) {
    runs[0]!.text = runs[0]!.text.trimStart()
    if (runs[0]!.text) break
    runs.shift()
  }
  while (runs.length) {
    runs.at(-1)!.text = runs.at(-1)!.text.trimEnd()
    if (runs.at(-1)!.text) break
    runs.pop()
  }
  return {
    text: runs.map((run) => run.text).join(''),
    ...(runs.some((run) => run.bold) ? { textRuns: runs } : {}),
  }
}

function extractAuthor(article: Element): {
  authorDisplayName?: string
  handle?: string
  avatarUrl?: string
  verified?: boolean
} {
  const userName = queryOwn(article, '[data-testid="User-Name"]')
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
    (queryOwn(article, '[data-testid="Tweet-User-Avatar"] img') as HTMLImageElement | null) ??
    (queryOwn(article, 'img[src*="profile_images"]') as HTMLImageElement | null)
  const avatarUrl = avatarImg?.src || undefined

  const verified = Boolean(
    queryOwn(article, '[data-testid="icon-verified"]') ||
      userName?.querySelector('[aria-label*="Verified" i]') ||
      userName?.querySelector('[aria-label*="认证" i]'),
  )

  return { authorDisplayName, handle, avatarUrl, verified }
}

function extractCreatedAt(article: Element): string | undefined {
  const time = queryOwn(article, 'time')
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

/** Parse counts from aria-labels like "531 Likes. Like" or "44K views". */
export function parseCountLabel(label: string | null | undefined): number | undefined {
  if (!label) return undefined
  const cleaned = label.replace(/,/g, '')
  // Prefer glued unit (44K / 1.2M), not the B in "Bookmarks"
  const glued = cleaned.match(/(\d+(?:\.\d+)?)([KMB万亿])(?=\s|$|[^a-zA-Z])/i)
  if (glued) {
    const n = Number(glued[1])
    if (Number.isNaN(n)) return undefined
    const unit = glued[2]!.toUpperCase()
    if (unit === 'K' || unit === '万') return Math.round(n * (unit === '万' ? 10_000 : 1_000))
    if (unit === 'M' || unit === '亿') return Math.round(n * (unit === '亿' ? 100_000_000 : 1_000_000))
    if (unit === 'B') return Math.round(n * 1_000_000_000)
  }
  const plain = cleaned.match(/(\d+(?:\.\d+)?)/)
  if (!plain) return undefined
  const n = Number(plain[1])
  return Number.isNaN(n) ? undefined : Math.round(n)
}

function buttonState(
  article: Element,
  testIds: string[],
): { count?: number; active: boolean; label: string } {
  for (const id of testIds) {
    const el = queryOwn(article, `[data-testid="${id}"]`)
    if (!el) continue
    const label =
      el.getAttribute('aria-label') ||
      el.querySelector('[aria-label]')?.getAttribute('aria-label') ||
      ''
    const count = parseCountLabel(label)
    return { count, active: true, label }
  }
  return { active: false, label: '' }
}

function extractStats(article: Element): {
  stats: PostStats
  liked?: boolean
  bookmarked?: boolean
} {
  const reply = buttonState(article, ['reply'])
  // inactive retweet vs retweeted
  const repostInactive = buttonState(article, ['retweet'])
  const repostActive = buttonState(article, ['unretweet'])
  const likeInactive = buttonState(article, ['like'])
  const likeActive = buttonState(article, ['unlike'])
  const bookmarkInactive = buttonState(article, ['bookmark'])
  const bookmarkActive = buttonState(article, ['removeBookmark'])

  let views: number | undefined
  const analytics =
    queryOwn(article, 'a[href*="/analytics"]') ||
    queryOwn(article, '[aria-label*="View" i], [aria-label*="次查看" i], [aria-label*="views" i]')
  if (analytics) {
    views = parseCountLabel(
      analytics.getAttribute('aria-label') || analytics.textContent || '',
    )
  }
  if (views === undefined) {
    // Fallback: group with views icon
    const group = queryOwn(article, '[role="group"]')
    if (group) {
      const labeled = Array.from(group.querySelectorAll('[aria-label]'))
      for (const el of labeled) {
        const lab = el.getAttribute('aria-label') ?? ''
        if (/view|查看|播放/i.test(lab) && !/reply|repost|like|bookmark/i.test(lab)) {
          views = parseCountLabel(lab)
          if (views !== undefined) break
        }
      }
    }
  }

  const stats: PostStats = {
    ...(reply.count !== undefined ? { replies: reply.count } : {}),
    ...((repostActive.count ?? repostInactive.count) !== undefined
      ? { reposts: (repostActive.count ?? repostInactive.count)! }
      : {}),
    ...((likeActive.count ?? likeInactive.count) !== undefined
      ? { likes: (likeActive.count ?? likeInactive.count)! }
      : {}),
    ...((bookmarkActive.count ?? bookmarkInactive.count) !== undefined
      ? { bookmarks: (bookmarkActive.count ?? bookmarkInactive.count)! }
      : {}),
    ...(views !== undefined ? { views } : {}),
  }

  return {
    stats,
    liked: likeActive.active || undefined,
    bookmarked: bookmarkActive.active || undefined,
  }
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

export function articleStatusUrl(article: Element, fallback: string): string {
  for (const time of Array.from(article.querySelectorAll('time'))) {
    if (time.closest('article') !== article) continue
    const href = time.closest('a')?.getAttribute('href')
    if (!href || !href.includes('/status/')) continue
    try {
      return new URL(href, fallback).href.split('?')[0]!
    } catch {
      continue
    }
  }
  return fallback.split('?')[0]!
}

export function scrapeArticle(article: Element, pageUrl: string): ScrapeResult {
  const { text, textRuns } = extractTweetText(article)
  if (!text) return { ok: false, reason: 'no_text_post' }

  const { authorDisplayName, handle, avatarUrl, verified } = extractAuthor(article)
  const createdAt = extractCreatedAt(article)
  const postUrl = extractPostUrl(article, pageUrl)
  const { stats, liked, bookmarked } = extractStats(article)

  const post: PostText = {
    text,
    ...(textRuns ? { textRuns } : {}),
    postUrl,
    ...(authorDisplayName ? { authorDisplayName } : {}),
    ...(handle ? { handle } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(verified ? { verified: true } : {}),
    ...(liked ? { liked: true } : {}),
    ...(bookmarked ? { bookmarked: true } : {}),
    ...(Object.keys(stats).length > 0 ? { stats } : {}),
  }

  return { ok: true, post }
}

export function scrapePostText(doc: Document = document, pageUrl: string = location.href): ScrapeResult {
  const article = pickArticle(doc, pageUrl)
  if (!article) return { ok: false, reason: 'no_text_post' }
  return scrapeArticle(article, pageUrl)
}
