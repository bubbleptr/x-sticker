/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { scrapePostText } from './scrape'

function mountTweetHtml(html: string, url: string): Document {
  document.body.innerHTML = html
  // happy-dom location is limited; scrape accepts pageUrl explicitly
  void url
  return document
}

const tweetArticle = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <a href="/katie_demo"><span>示例作者</span></a>
    <a href="/katie_demo"><span>@katie_demo</span></a>
  </div>
  <div data-testid="Tweet-User-Avatar"><img src="https://example.com/a.jpg" alt="" /></div>
  <div data-testid="tweetText"><span>今天天气很好 Hello 卡贴</span></div>
  <a href="/katie_demo/status/1234567890"><time datetime="2026-09-23T12:00:00.000Z">Sep 23</time></a>
</article>
`

describe('scrapePostText', () => {
  it('scrapes primary status tweet into PostText', () => {
    const doc = mountTweetHtml(tweetArticle, 'https://x.com/katie_demo/status/1234567890')
    const result = scrapePostText(doc, 'https://x.com/katie_demo/status/1234567890')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.post.text).toContain('卡贴')
    expect(result.post.handle).toBe('katie_demo')
    expect(result.post.authorDisplayName).toBe('示例作者')
    expect(result.post.postUrl).toContain('/status/1234567890')
    expect(result.post.handle?.startsWith('@')).toBe(false)
  })

  it('returns no_text_post when tweetText missing', () => {
    const doc = mountTweetHtml(
      `<article data-testid="tweet"><div data-testid="User-Name"><span>x</span></div></article>`,
      'https://x.com/home',
    )
    const result = scrapePostText(doc, 'https://x.com/home')
    expect(result).toEqual({ ok: false, reason: 'no_text_post' })
  })
})
