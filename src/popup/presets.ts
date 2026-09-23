export const BACKGROUND_PRESETS: Array<{
  id: string
  label: string
  background: import('../types').Background
}> = [
  {
    id: 'xblue',
    label: '天蓝渐变',
    background: { kind: 'gradient', from: '#1d9bf0', to: '#0c4a6e' },
  },
  {
    id: 'violet',
    label: '紫蓝渐变',
    background: { kind: 'gradient', from: '#1d9bf0', to: '#7856ff' },
  },
  {
    id: 'ink',
    label: '墨黑',
    background: { kind: 'solid', color: '#0f1419' },
  },
  {
    id: 'dusk',
    label: '暮色渐变',
    background: { kind: 'gradient', from: '#292524', to: '#78716c' },
  },
  {
    id: 'paper',
    label: '米白',
    background: { kind: 'solid', color: '#e7e5e4' },
  },
]
