import type { BundledBackgroundFile } from './photoBackgrounds'

export type PostStats = {
  replies?: number
  reposts?: number
  likes?: number
  bookmarks?: number
  views?: number
}

export type PostText = {
  text: string
  authorDisplayName?: string
  /** Without leading @; normalize at scrape boundary. */
  handle?: string
  avatarUrl?: string
  /** ISO string when available. */
  createdAt?: string
  postUrl: string
  stats?: PostStats
  liked?: boolean
  bookmarked?: boolean
  verified?: boolean
}

export type AspectRatio = '3:4' | '9:16'

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'image'; src: BundledBackgroundFile }

export type MetaLocale = 'zh-CN' | 'en'

export type RenderOptions = {
  /** Default true. */
  hideHandle: boolean
  /** Default true. */
  showAuthor: boolean
  /** Default '3:4'. */
  aspect: AspectRatio
  /** Outer frame behind the white X post card. */
  background: Background
  /** Meta row locale. Default 'zh-CN' (X web zh). */
  locale?: MetaLocale
  /** Top-right ··· menu like status detail. Default true. */
  showMenu?: boolean
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  hideHandle: true,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#ffffff' },
  locale: 'zh-CN',
  showMenu: true,
}

export const ASPECT_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  '3:4': { width: 1080, height: 1440 },
  '9:16': { width: 1080, height: 1920 },
}

export type ScrapeResult =
  | { ok: true; post: PostText }
  | { ok: false; reason: 'no_text_post' }

export type KatieMessage =
  | { type: 'OPEN_CARD_OVERLAY' }
  | { type: 'DOWNLOAD_PNG'; bytes: number[]; filename: string }
  | { type: 'DOWNLOAD_OK' }
  | { type: 'DOWNLOAD_ERR'; message: string }
