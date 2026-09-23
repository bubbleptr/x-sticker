/** Compact count: en `44K` / zh-CN `1.4万`. */
export function formatCompactCount(n: number, locale: 'zh-CN' | 'en' = 'zh-CN'): string {
  if (locale === 'zh-CN') {
    if (n < 10_000) return String(Math.round(n))
    if (n < 100_000_000) {
      const truncated = Math.floor((n / 10_000) * 10) / 10
      return `${String(truncated).replace(/\.0$/, '')}万`
    }
    const truncated = Math.floor((n / 100_000_000) * 10) / 10
    return `${String(truncated).replace(/\.0$/, '')}亿`
  }
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) {
    const v = n / 1000
    return `${v.toFixed(v >= 10 || Number.isInteger(v) ? 0 : 1).replace(/\.0$/, '')}K`
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  if (n < 1_000_000_000) {
    const v = n / 1_000_000
    return `${v.toFixed(v >= 10 ? 0 : 1).replace(/\.0$/, '')}M`
  }
  return `${Math.round(n / 1_000_000_000)}B`
}

/** zh-CN: `下午11:32 · 2026年9月22日` ; en: `11:32 PM · Sep 22, 2026`. */
export function formatMetaClock(
  iso?: string,
  locale: 'zh-CN' | 'en' = 'zh-CN',
  timeZone = 'Asia/Shanghai',
): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''

  if (locale === 'zh-CN') {
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
    const dayPeriod = parts.dayPeriod ?? ''
    const hour = parts.hour ?? ''
    const minute = parts.minute ?? ''
    const year = parts.year ?? ''
    const month = parts.month ?? ''
    const day = parts.day ?? ''
    const period = /午|上午|下午|晚上|凌晨|清晨/.test(dayPeriod)
      ? dayPeriod
      : Number(hour) >= 12
        ? '下午'
        : '上午'
    let h12 = Number(hour)
    if (Number.isNaN(h12)) h12 = 0
    return `${period}${h12}:${minute} · ${year}年${month}月${day}日`
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod} · ${parts.month} ${parts.day}, ${parts.year}`
}
