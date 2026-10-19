import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Citation } from '../types'
import { CitationCard } from './CitationCard'

const citation: Citation = {
  citation_id: 'ev_internal_par_secret',
  speaker: '孙宇晨',
  speaker_confirmed: true,
  quote: '可核验的原文',
  paragraph_id: 'par_internal',
  turn_id: 'turn_internal',
  display_timestamp: '00:01:05',
  source: {
    path: '内部/权威稿.md',
    markdown_sha256: 'SECRET_HASH',
    line_start: 1,
    line_end: 1,
  },
  alignment_status: 'accurate',
  audio_start: 65,
  audio_end: 70,
  candidate_audio_start: null,
  candidate_audio_end: null,
  audio_url: '/api/media/audio',
  playback_available: true,
}

describe('CitationCard public rendering', () => {
  it('shows human-readable citation data but no internal evidence key or source hash', () => {
    const html = renderToStaticMarkup(
      <CitationCard citation={citation} index={0} onPlay={vi.fn()} />,
    )

    expect(html).toContain('引用 1')
    expect(html).toContain('可核验的原文')
    expect(html).toContain('孙宇晨')
    expect(html).toContain('00:01:05')
    expect(html).toContain('播放 1:05–1:10')
    expect(html).toContain('访谈逐字稿 · 第 1 行')
    expect(html).not.toContain('内部/权威稿.md')
    expect(html).not.toContain('ev_internal')
    expect(html).not.toContain('SECRET_HASH')
    expect(html).not.toContain('D:\\PROJECTS')
  })

  it('explains uncertain audio alignment without exposing candidate coordinates', () => {
    const html = renderToStaticMarkup(
      <CitationCard citation={{ ...citation, alignment_status: 'needs_review', audio_start: null, audio_end: null, candidate_audio_start: 12, candidate_audio_end: 18, playback_available: false }} index={0} onPlay={vi.fn()} />,
    )
    expect(html).toContain('音频时间待确认')
    expect(html).toContain('暂不提供跳转')
    expect(html).not.toContain('候选范围')
    expect(html).not.toContain('0:12')
  })
})
