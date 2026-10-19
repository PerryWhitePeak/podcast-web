import type { Citation } from '../types'

export function formatTime(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '--:--'
  const total = Math.floor(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function canPlayCitation(citation: Citation): boolean {
  return (
    citation.alignment_status === 'accurate' &&
    citation.playback_available === true &&
    typeof citation.audio_start === 'number' &&
    typeof citation.audio_end === 'number' &&
    citation.audio_end > citation.audio_start &&
    Boolean(citation.audio_url)
  )
}

export function publicAnswerText(value: string): string {
  const evidenceId = /ev_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*/g
  return value
    .replace(/[（(]\s*ev_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*(?:\s*[、,，;；]\s*ev_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)*\s*[）)]/g, '')
    .replace(evidenceId, '')
    .replace(/[（(]\s*[、,，;；\s]*[）)]/g, '')
    .replace(/[ 　]+([，。！？；：,.!?;:])/g, '$1')
    .trim()
}

export function sourceLabel(citation: Citation): string {
  const { source } = citation
  return `访谈逐字稿 · 第 ${source.line_start}${source.line_end !== source.line_start ? `–${source.line_end}` : ''} 行`
}

export interface PublicFailure {
  title: string
  message: string
  retryNote: string
  retryLabel: '手动重试' | '重新生成'
  stopped: boolean
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

export function publicFailure(error: unknown): PublicFailure {
  const code = errorCode(error)
  if (code === 'USER_STOPPED') {
    return {
      title: '本次回答未完成',
      message: '已停止生成，问题已保留。',
      retryNote: '你可以修改问题后再次发送，也可以手动重试。',
      retryLabel: '手动重试',
      stopped: true,
    }
  }

  const known: Record<string, string> = {
    AUTH_REQUIRED: '这个问题需要调用模型，请先登录后再发送。网站用法等即时回复无需登录。',
    USER_QUOTA_EXHAUSTED: '你的问答次数已用完；可兑换邀请码，网站用法等即时回复仍可使用。',
    LLM_NOT_CONFIGURED: '问答功能暂时不可用，你仍可使用逐字稿搜索。',
    LLM_DAILY_BUDGET_EXHAUSTED: '今天的问答额度已用完，请稍后再试。',
    LLM_TIMEOUT: '回答等待时间过长，本次没有完成。',
    LLM_UPSTREAM_ERROR: '问答服务暂时不稳定，本次没有完成。',
    CITATION_VALIDATION_FAILED: '回答与访谈原文无法可靠对应，因此没有展示。你可以换一种问法后再试。',
    RETRIEVAL_TIMEOUT: '查找访谈内容用时过长，本次没有完成。',
    RETRIEVAL_UNAVAILABLE: '访谈内容暂时无法搜索。',
    RAG_UNAVAILABLE: '访谈问答暂时不可用。',
    SERVICE_NOT_CONFIGURED: '在线服务尚未连接，本次没有发送请求。',
    VALIDATION_ERROR: '问题格式不符合要求，请检查长度后再试。',
    REQUEST_TIMEOUT: '等待时间过长，本次请求状态无法确认。',
    STREAM_INTERRUPTED: '回答传输中断，本次内容没有完整收到。',
    STREAM_NETWORK_ERROR: '网络连接中断，本次内容没有完整收到。',
    STREAM_TIMEOUT: '回答长时间没有新内容，本次没有完成。',
    STREAM_MALFORMED: '收到的回答不完整，本次没有展示。',
    STREAM_UNAVAILABLE: '当前浏览器无法接收流式回答。',
    STREAM_TOO_LARGE: '回答内容过长，本次已停止接收。',
    HTTP_429: '请求过于频繁，请稍后再试。',
    HTTP_500: '服务暂时出现问题，本次没有完成。',
    HTTP_502: '问答服务暂时不稳定，本次没有完成。',
  }
  const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined
  const message = (code && known[code])
    || (status === 429 ? known.HTTP_429 : undefined)
    || (status === 500 ? known.HTTP_500 : undefined)
    || (status === 502 ? known.HTTP_502 : undefined)
    || '服务暂时无法完成请求。'
  return {
    title: '本次回答未完成',
    message,
    retryNote: '为避免重复提交，不会自动重发。问题已保留，你可以确认后手动重试。',
    retryLabel: code === 'CITATION_VALIDATION_FAILED' ? '重新生成' : '手动重试',
    stopped: false,
  }
}

export function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return '发生未知错误，请稍后手动重试。'
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  const known: Record<string, string> = {
    AUTH_REQUIRED: '这个问题需要调用模型，请先登录。',
    USER_QUOTA_EXHAUSTED: '你的问答次数已用完，可兑换邀请码。',
    LLM_NOT_CONFIGURED: '问答模型尚未配置。你仍可使用逐字稿搜索。',
    LLM_DAILY_BUDGET_EXHAUSTED: '今天的问答额度已用完，请稍后再试。',
    LLM_TIMEOUT: '模型响应超时，请稍后重试。',
    LLM_UPSTREAM_ERROR: '模型服务暂时不可用，请稍后重试。',
    CITATION_VALIDATION_FAILED: '回答与访谈原文无法可靠对应，因此没有展示。请调整问题后手动重试。',
    RETRIEVAL_TIMEOUT: '检索超时，请稍后重试。',
    RETRIEVAL_UNAVAILABLE: '检索服务暂时不可用。',
    RAG_UNAVAILABLE: '知识库服务暂时不可用。',
    SERVICE_NOT_CONFIGURED: '在线服务尚未连接。',
    VALIDATION_ERROR: '输入不符合要求，请检查问题长度。',
    REQUEST_TIMEOUT: '请求等待时间过长，请检查服务状态后手动重试。',
    USER_STOPPED: '已停止生成，本次回答未完成。',
    STREAM_INTERRUPTED: '流式响应中断，本次回答未完成。',
    STREAM_NETWORK_ERROR: '网络连接中断，本次回答未完成。',
    STREAM_TIMEOUT: '流式回答等待超时，本次回答未完成。',
    STREAM_MALFORMED: '流式响应格式错误，本次回答未完成。',
    STREAM_UNAVAILABLE: '当前浏览器无法读取流式回答。',
    STREAM_TOO_LARGE: '回答内容过长，本次已停止接收。',
    HTTP_429: '请求过于频繁，请稍后手动重试。',
    HTTP_500: '服务暂时出现问题，请稍后手动重试。',
    HTTP_502: '问答服务暂时不稳定，请稍后手动重试。',
  }
  if (code && known[code]) return known[code]
  if (code || ('status' in error && typeof error.status === 'number')) return '服务暂时无法完成请求，请稍后手动重试。'
  return '发生未知错误，请稍后手动重试。'
}
