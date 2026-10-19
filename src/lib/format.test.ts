import { describe, expect, it } from 'vitest'
import { canPlayCitation, formatTime, publicAnswerText, publicFailure, sourceLabel } from './format'
import { ApiError } from './api'
import type { Citation } from '../types'

const baseCitation: Citation = {
  citation_id: 'ev_1',
  speaker: '邵艾伦',
  speaker_confirmed: true,
  quote: '原文',
  paragraph_id: 'p_1',
  turn_id: 't_1',
  display_timestamp: null,
  source: { path: 'source.md', markdown_sha256: 'hash', line_start: 1, line_end: 2 },
  alignment_status: 'accurate',
  audio_start: 65,
  audio_end: 70,
  candidate_audio_start: null,
  candidate_audio_end: null,
  audio_url: '/api/media/audio',
  playback_available: true,
}

describe('formatTime', () => {
  it('formats minute and hour timestamps', () => {
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(3661)).toBe('1:01:01')
  })
})

describe('canPlayCitation', () => {
  it('accepts only fully authorized accurate ranges', () => {
    expect(canPlayCitation(baseCitation)).toBe(true)
    expect(canPlayCitation({ ...baseCitation, alignment_status: 'needs_review' })).toBe(false)
    expect(canPlayCitation({ ...baseCitation, alignment_status: 'unmatched' })).toBe(false)
    expect(canPlayCitation({ ...baseCitation, playback_available: false })).toBe(false)
    expect(canPlayCitation({ ...baseCitation, audio_start: null })).toBe(false)
    expect(canPlayCitation({ ...baseCitation, audio_end: 60 })).toBe(false)
  })
})

describe('publicAnswerText', () => {
  it('removes backend-only evidence IDs without removing prose', () => {
    expect(publicAnswerText('结论（ev_ab12_par_cd34）；补充 ev_deadbeef_par_1234。'))
      .toBe('结论；补充。')
  })
})

describe('public presentation boundaries', () => {
  it('uses a stable source label instead of the backend path', () => {
    expect(sourceLabel({ ...baseCitation, source: { ...baseCitation.source, path: 'D:/private/internal.md' } }))
      .toBe('访谈逐字稿 · 第 1–2 行')
  })

  it('never exposes server error text and makes retries explicitly manual', () => {
    const failure = publicFailure(new ApiError('PRIVATE_VALIDATOR_DETAIL ev_secret', 502, 'CITATION_VALIDATION_FAILED'))
    expect(failure.message).toContain('无法可靠对应')
    expect(failure.message).not.toContain('PRIVATE_VALIDATOR_DETAIL')
    expect(failure.retryNote).toContain('不会自动重发')
  })
})
