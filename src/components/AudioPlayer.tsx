import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Citation, HealthResponse } from '../types'
import { apiUrl, isApiConfigured, isCrossOriginApi } from '../lib/api'
import { canPlayCitation, formatTime } from '../lib/format'
import { CloseIcon, PauseIcon, PlayIcon, WaveIcon } from './Icons'

export interface AudioPlayerHandle {
  playCitation: (citation: Citation) => void
  playRange: (start: number, end?: number) => void
}

interface AudioPlayerProps {
  health: HealthResponse | null
  onClose?: () => void
}

type AudioState = 'unavailable' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { health, onClose },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const pendingRef = useRef<{ start: number; end: number } | null>(null)
  const segmentEndRef = useRef<number | null>(null)
  const [state, setState] = useState<AudioState>(isApiConfigured ? 'loading' : 'unavailable')
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(health?.audio_duration_seconds ?? 0)
  const [segment, setSegment] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState('Podcast 完整音频')

  const audioAvailable = isApiConfigured && (health?.audio_available ?? true)

  const startRange = async (start: number, end: number) => {
    const audio = audioRef.current
    if (!audio) return
    segmentEndRef.current = end
    setSegment(`${formatTime(start)}–${formatTime(end)}`)
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      pendingRef.current = { start, end }
      audio.load()
      setState('loading')
      return
    }
    audio.currentTime = start
    try {
      await audio.play()
    } catch {
      setState('error')
    }
  }

  useImperativeHandle(ref, () => ({
    playCitation(citation) {
      if (!canPlayCitation(citation)) return
      setSourceLabel(`${citation.speaker_confirmed && citation.speaker ? citation.speaker : '访谈引用'}${citation.display_timestamp ? ` · ${citation.display_timestamp}` : ''}`)
      void startRange(citation.audio_start as number, citation.audio_end as number)
    },
    playRange(start, end = start + 25) {
      setSourceLabel('逐字稿定位播放')
      void startRange(start, end)
    },
  }))

  useEffect(() => {
    if (health?.audio_duration_seconds) setDuration(health.audio_duration_seconds)
    if (health && !health.audio_available) setState('unavailable')
  }, [health])

  useEffect(() => () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    pendingRef.current = null
    segmentEndRef.current = null
  }, [])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || !audioAvailable) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
    } catch {
      setState('error')
    }
  }

  const onSeek = (value: number) => {
    const audio = audioRef.current
    if (!audio) return
    segmentEndRef.current = null
    setSegment(null)
    audio.currentTime = value
    setCurrent(value)
  }

  const close = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    pendingRef.current = null
    segmentEndRef.current = null
    onClose?.()
  }

  return (
    <section className={`audio-player${onClose ? ' audio-player-closable' : ''}`} aria-label="播客音频播放器">
      <audio
        ref={audioRef}
        src={isApiConfigured ? apiUrl('/api/media/audio') : undefined}
        crossOrigin={isCrossOriginApi ? 'use-credentials' : undefined}
        preload="metadata"
        onLoadStart={() => audioAvailable && setState('loading')}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget
          if (Number.isFinite(audio.duration)) setDuration(audio.duration)
          setState('ready')
          const pending = pendingRef.current
          if (pending) {
            pendingRef.current = null
            void startRange(pending.start, pending.end)
          }
        }}
        onPlay={() => setState('playing')}
        onPause={() => setState('paused')}
        onError={() => audioAvailable && setState('error')}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          setCurrent(audio.currentTime)
          const segmentEnd = segmentEndRef.current
          if (segmentEnd != null && audio.currentTime >= segmentEnd) {
            audio.pause()
            audio.currentTime = segmentEnd
            setCurrent(segmentEnd)
            segmentEndRef.current = null
            setSegment(null)
          }
        }}
      />
      <button
        className="audio-toggle"
        type="button"
        onClick={() => void toggle()}
        disabled={!audioAvailable || state === 'loading'}
        aria-label={state === 'playing' ? '暂停' : '播放'}
      >
        {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-info">
        <div className="audio-title-row">
          <WaveIcon />
          <strong>{sourceLabel}</strong>
          <span className={`audio-state state-${state}`} role="status" aria-live="polite">
            {state === 'loading' ? '加载中' : state === 'error' ? '加载失败' : state === 'unavailable' ? '不可用' : segment ? `片段 ${segment}` : '完整节目'}
          </span>
        </div>
        <div className="progress-row">
          <span>{formatTime(current)}</span>
          <input
            aria-label="音频进度"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="0.1"
            value={Math.min(current, Math.max(duration, 1))}
            disabled={!audioAvailable || duration <= 0}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ '--progress': `${duration > 0 ? (current / duration) * 100 : 0}%` } as React.CSSProperties}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {onClose && <button className="audio-close" type="button" onClick={close} aria-label="关闭音频播放器"><CloseIcon /></button>}
    </section>
  )
})
