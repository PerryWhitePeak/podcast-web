import type { Citation } from '../types'
import { canPlayCitation, formatTime, sourceLabel } from '../lib/format'
import { PlayIcon, QuoteIcon } from './Icons'

interface CitationCardProps {
  citation: Citation
  index: number
  compact?: boolean
  onPlay: (citation: Citation) => void
}

const statusText: Record<Citation['alignment_status'], string> = {
  accurate: '可播放原声',
  needs_review: '音频时间待确认',
  unmatched: '暂无音频位置',
  not_applicable: '仅提供文字',
}

export function CitationCard({ citation, index, compact = false, onPlay }: CitationCardProps) {
  const playable = canPlayCitation(citation)
  return (
    <article className={`citation-card status-${citation.alignment_status} ${compact ? 'compact' : ''}`}>
      <div className="citation-topline">
        <span className="citation-index"><QuoteIcon /> 引用 {index + 1}</span>
        <span className="alignment-badge">{statusText[citation.alignment_status]}</span>
      </div>
      <blockquote>{citation.quote}</blockquote>
      <div className="citation-meta">
        <span className="speaker-name">{citation.speaker_confirmed ? citation.speaker : '说话人未确认'}</span>
        {citation.display_timestamp && <span>{citation.display_timestamp}</span>}
      </div>
      <div className="citation-source">{sourceLabel(citation)}</div>
      <div className="citation-action-row">
        {playable ? (
          <button className="play-citation" type="button" onClick={() => onPlay(citation)}>
            <PlayIcon /> 播放 {formatTime(citation.audio_start)}–{formatTime(citation.audio_end)}
          </button>
        ) : citation.alignment_status === 'needs_review' ? (
          <span className="restricted-time">这段原文的音频时间尚未确认，暂不提供跳转</span>
        ) : (
          <span className="restricted-time">这段原文暂不提供音频跳转</span>
        )}
      </div>
    </article>
  )
}
