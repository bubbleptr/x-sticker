import { defineManifest } from '@crxjs/vite-plugin'
import { BUNDLED_BACKGROUND_FILES } from './src/photoBackgrounds'

const icons = {
  '16': 'public/icons/icon16.png',
  '32': 'public/icons/icon32.png',
  '48': 'public/icons/icon48.png',
  '128': 'public/icons/icon128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'X Sticker',
  short_name: 'X Sticker',
  description: '把 X/Twitter 帖子做成文字封面与原始配图，下载或存到小红书、抖音草稿',
  version: '0.4.1',
  action: {
    default_title: 'X Sticker',
    default_icon: icons,
  },
  background: {
    service_worker: 'src/background/sw.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://creator.xiaohongshu.com/*', 'https://creator.douyin.com/*'],
      js: ['src/drafts/creator.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'downloads', 'storage', 'declarativeContent'],
  host_permissions: [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://pbs.twimg.com/*',
    'https://abs.twimg.com/*',
    'https://creator.xiaohongshu.com/*',
    'https://creator.douyin.com/*',
  ],
  web_accessible_resources: [
    {
      resources: [...BUNDLED_BACKGROUND_FILES],
      matches: ['https://x.com/*', 'https://twitter.com/*'],
    },
  ],
  icons,
})
