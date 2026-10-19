import type { HealthResponse } from '../types'
import { RetryIcon } from './Icons'

interface HealthPanelProps {
  health: HealthResponse | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export function HealthPanel({ health, loading, error, onRetry }: HealthPanelProps) {
  return (
    <div className="health-popover">
      <div className="health-heading">
        <div>
          <span className={`status-dot ${health?.status === 'ok' ? 'ok' : 'warning'}`} />
          <strong>{loading ? '正在检查服务' : error ? '服务暂不可用' : health?.status === 'ok' ? '全部功能可用' : '部分功能受限'}</strong>
        </div>
        {onRetry && <button type="button" onClick={onRetry} aria-label="重新检查"><RetryIcon /></button>}
      </div>
      {error ? <p className="health-error">{error}</p> : health && (
        <>
          <dl>
            <div><dt>访谈资料</dt><dd>{health.canonical_source_current ? '可用' : '暂不可用'}</dd></div>
            <div><dt>内容搜索</dt><dd>{health.keyword_index_ready ? '可用' : '暂不可用'}</dd></div>
            <div><dt>AI 问答</dt><dd>{health.llm_configured ? '可用' : '暂不可用'}</dd></div>
            <div><dt>音频播放</dt><dd>{health.audio_available ? '可用' : '暂不可用'}</dd></div>
          </dl>
        </>
      )}
    </div>
  )
}
