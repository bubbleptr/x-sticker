export type PostText = {
  text: string
  authorDisplayName?: string
  /** Without leading @; normalize at scrape boundary. */
  handle?: string
  avatarUrl?: string
  /** ISO string when available. */
  createdAt?: string
  postUrl: string
}

export type AspectRatio = '3:4' | '9:16'

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string }

export type RenderOptions = {
  /** Default true. */
  hideHandle: boolean
  /** Default true. */
  showAuthor: boolean
  /** Default '3:4'. */
  aspect: AspectRatio
  /** Default soft near-white solid. */
  background: Background
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  hideHandle: true,
  showAuthor: true,
  aspect: '3:4',
  /** Outer frame behind the white X post card. */
  background: { kind: 'gradient', from: '#1d9bf0', to: '#7856ff' },
}

export const ASPECT_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  '3:4': { width: 1080, height: 1440 },
  '9:16': { width: 1080, height: 1920 },
}

export type ScrapeResult =
  | { ok: true; post: PostText }
  | { ok: false; reason: 'no_text_post' }

export type KatieMessage =
  | { type: 'SCRAPE_POST' }
  | { type: 'SCRAPE_RESULT'; result: ScrapeResult }
  | { type: 'DOWNLOAD_PNG'; bytes: number[]; filename: string }
  | { type: 'DOWNLOAD_OK' }
  | { type: 'DOWNLOAD_ERR'; message: string }
