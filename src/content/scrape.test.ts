/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { articleStatusUrl, parseCountLabel, scrapeArticle, scrapePostText } from './scrape'

function mountTweetHtml(html: string): Document {
  document.body.innerHTML = html
  return document
}

const tweetArticle = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <a href="/katie_demo"><span>示例作者</span></a>
    <svg data-testid="icon-verified"></svg>
    <a href="/katie_demo"><span>@katie_demo</span></a>
  </div>
  <div data-testid="Tweet-User-Avatar"><img src="https://example.com/a.jpg" alt="" /></div>
  <div data-testid="tweetText"><span>今天天气很好 Hello 卡贴</span></div>
  <a href="/katie_demo/status/1234567890"><time datetime="2026-09-23T12:00:00.000Z">Sep 23</time></a>
  <div role="group">
    <button data-testid="reply" aria-label="40 Replies. Reply"></button>
    <button data-testid="retweet" aria-label="83 Reposts. Repost"></button>
    <button data-testid="unlike" aria-label="531 Likes. Liked"></button>
    <button data-testid="removeBookmark" aria-label="329 Bookmarks. Bookmarked"></button>
    <a href="/katie_demo/status/1234567890/analytics" aria-label="44000 views. View post analytics"></a>
  </div>
</article>
`

describe('parseCountLabel', () => {
  it('parses plain and compact counts', () => {
    expect(parseCountLabel('40 Replies. Reply')).toBe(40)
    expect(parseCountLabel('44K views')).toBe(44000)
    expect(parseCountLabel('1.2M Likes')).toBe(1200000)
  })
})

describe('scrapePostText', () => {
  it('scrapes primary status tweet into PostText with stats', () => {
    const doc = mountTweetHtml(tweetArticle)
    const result = scrapePostText(doc, 'https://x.com/katie_demo/status/1234567890')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.post.text).toContain('卡贴')
    expect(result.post.handle).toBe('katie_demo')
    expect(result.post.authorDisplayName).toBe('示例作者')
    expect(result.post.verified).toBe(true)
    expect(result.post.liked).toBe(true)
    expect(result.post.bookmarked).toBe(true)
    expect(result.post.stats?.replies).toBe(40)
    expect(result.post.stats?.reposts).toBe(83)
    expect(result.post.stats?.likes).toBe(531)
    expect(result.post.stats?.bookmarks).toBe(329)
    expect(result.post.stats?.views).toBe(44000)
  })

  it('scrapes the requested article, including its own status url', () => {
    const doc = mountTweetHtml(`
      <article data-testid="tweet" id="outer">
        <article data-testid="tweet" id="quote">
          <div data-testid="tweetText"><span>引用里的字</span></div>
          <a href="/quote/status/999"><time datetime="2026-01-01T00:00:00.000Z">q</time></a>
        </article>
        <div data-testid="tweetText"><span>外层贴文</span></div>
        <a href="/me/status/222"><time datetime="2026-09-23T13:00:00.000Z">t</time></a>
      </article>
    `)
    const outer = doc.getElementById('outer')!
    const page = 'https://x.com/someone/status/111'
    expect(articleStatusUrl(outer, page)).toBe('https://x.com/me/status/222')
    const result = scrapeArticle(outer, articleStatusUrl(outer, page))
    expect(result).toMatchObject({
      ok: true,
      post: { text: '外层贴文', postUrl: 'https://x.com/me/status/222' },
    })
  })

  it('returns no_text_post when tweetText missing', () => {
    const doc = mountTweetHtml(
      `<article data-testid="tweet"><div data-testid="User-Name"><span>x</span></div></article>`,
    )
    const result = scrapePostText(doc, 'https://x.com/home')
    expect(result).toEqual({ ok: false, reason: 'no_text_post' })
  })
})
