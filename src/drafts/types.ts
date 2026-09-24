export type DraftPlatform = 'xiaohongshu' | 'douyin'
export type DraftStep = 'opening' | 'uploading' | 'filling' | 'saving' | 'verifying'
export type DraftStatus = 'queued' | 'running' | 'needs_attention' | 'saved'

export interface DraftInput {
  platforms: DraftPlatform[]
  title: string
  body: string
  sourceUrl: string
  filename: string
  bytes: number[]
}

export interface DraftEvidence {
  title: string
  body: string
  imageCount: number
  imageHash: string
  storage: 'browser' | 'account' | 'unknown'
  verifiedAt: number
}

export interface DraftJob {
  id: string
  assetId: string
  platform: DraftPlatform
  title: string
  body: string
  sourceUrl: string
  filename: string
  createdAt: number
  updatedAt: number
  status: DraftStatus
  step: DraftStep
  message: string
  tabId?: number
  account?: string
  evidence?: DraftEvidence
  imageHash?: string
}

export interface DraftUpdate {
  status: Exclude<DraftStatus, 'queued'>
  step: DraftStep
  message: string
  account?: string
  evidence?: DraftEvidence
  imageHash?: string
}

export type DraftMessage =
  | { type: 'DRAFT_CREATE'; input: DraftInput }
  | { type: 'DRAFT_LIST' }
  | { type: 'DRAFT_CLAIM'; platform: DraftPlatform }
  | { type: 'DRAFT_INSPECT'; platform: DraftPlatform }
  | { type: 'DRAFT_UPDATE'; id: string; update: DraftUpdate }
  | { type: 'DRAFT_OPEN'; id: string }

export type DraftResponse =
  | { ok: true; jobs: DraftJob[] }
  | { ok: true; job: DraftJob; bytes: number[] }
  | { ok: true }
  | { ok: false; error: string }

export const DRAFT_TARGETS: Record<DraftPlatform, { label: string; url: string; origin: string }> = {
  xiaohongshu: {
    label: '小红书',
    url: 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image',
    origin: 'https://creator.xiaohongshu.com',
  },
  douyin: {
    label: '抖音',
    url: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
    origin: 'https://creator.douyin.com',
  },
}
