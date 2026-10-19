import type { AccountResponse, ApiErrorBody, ChatResponse, ChatStreamEvent, HealthResponse, SearchResponse } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const isGitHubPagesBuild = import.meta.env.VITE_PUBLIC_DEPLOYMENT === 'github-pages'

export const isApiConfigured = Boolean(API_BASE) || !isGitHubPagesBuild

export const isCrossOriginApi = (() => {
  if (!API_BASE || typeof window === 'undefined') return false
  try { return new URL(API_BASE, window.location.href).origin !== window.location.origin }
  catch { return false }
})()

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function requireApi(): void {
  if (!isApiConfigured) {
    throw new ApiError('服务尚未配置。', 503, 'SERVICE_NOT_CONFIGURED')
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    return new ApiError('服务未能完成请求。', response.status, `HTTP_${response.status}`)
  }

  if (Array.isArray(body.detail)) {
    return new ApiError('请求参数不符合要求。', response.status, 'VALIDATION_ERROR')
  }

  return new ApiError(
    '服务未能完成请求。',
    response.status,
    body.detail?.code || `HTTP_${response.status}`,
  )
}

async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  requireApi()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    })
    if (!response.ok) throw await parseError(response)
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError || error instanceof SyntaxError) throw error
    if (controller.signal.aborted) {
      throw new ApiError('请求等待时间过长，请检查服务状态后手动重试。', undefined, 'REQUEST_TIMEOUT')
    }
    throw new ApiError('无法连接服务。', undefined, 'NETWORK_UNAVAILABLE')
  } finally {
    clearTimeout(timeout)
  }
}

async function requestVoid(path: string, init: RequestInit): Promise<void> {
  requireApi()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
    })
    if (!response.ok) throw await parseError(response)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) throw new ApiError('请求等待时间过长。', undefined, 'REQUEST_TIMEOUT')
    throw new ApiError('无法连接服务。', undefined, 'NETWORK_UNAVAILABLE')
  } finally {
    clearTimeout(timeout)
  }
}

function postQuestion<T>(path: string, question: string, topK: number): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, top_k: topK }),
  })
}

export const getHealth = () => requestJson<HealthResponse>('/api/health', undefined, 10_000)
export const askQuestion = (question: string, topK = 5) =>
  postQuestion<ChatResponse>('/api/chat', question, topK)
export const searchTranscript = (question: string, topK = 5) =>
  postQuestion<SearchResponse>('/api/search', question, topK)

export const requestOtp = (email: string) => requestJson<{ status: string; message: string }>('/api/auth/otp/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
})
export const verifyOtp = (email: string, code: string) => requestJson<AccountResponse>('/api/auth/otp/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }),
})
export const getAccount = () => requestJson<AccountResponse>('/api/auth/me')
export const logout = (csrfToken: string) => requestVoid('/api/auth/logout', {
  method: 'POST', headers: { 'X-CSRF-Token': csrfToken },
})
export const redeemInvitation = (code: string, csrfToken: string) => requestJson<AccountResponse>('/api/invitations/redeem', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ code }),
})

export class SSEFrameParser {
  private buffer = ''

  feed(chunk: string): Array<{ event: string; data: unknown }> {
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n')
    if (this.buffer.length > 1_000_000) throw new ApiError('流式响应过大，已停止接收。', undefined, 'STREAM_TOO_LARGE')
    const frames: Array<{ event: string; data: unknown }> = []
    while (true) {
      const end = this.buffer.indexOf('\n\n')
      if (end < 0) break
      const frame = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 2)
      const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
      const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (event && data) {
        try { frames.push({ event, data: JSON.parse(data) as unknown }) }
        catch { throw new ApiError('流式响应格式错误，本次回答未完成。', undefined, 'STREAM_MALFORMED') }
      }
    }
    return frames
  }

  finish(): void {
    if (this.buffer.trim()) throw new ApiError('流式响应中断，本次回答未完成。', undefined, 'STREAM_INTERRUPTED')
  }
}

export async function askQuestionStream(
  question: string,
  topK: number,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
  auth?: { requestId: string; csrfToken: string },
): Promise<void> {
  requireApi()
  const controller = new AbortController()
  let timeoutKind: 'connect' | 'idle' | 'total' | null = null
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) controller.abort()
  const connectTimer = setTimeout(() => { timeoutKind = 'connect'; controller.abort() }, 120_000)
  const totalTimer = setTimeout(() => { timeoutKind = 'total'; controller.abort() }, 240_000)
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const refreshIdle = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { timeoutKind = 'idle'; controller.abort() }, 60_000)
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch(apiUrl('/api/chat/stream'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'text/event-stream', 'Content-Type': 'application/json',
        ...(auth ? { 'X-CSRF-Token': auth.csrfToken, 'X-Request-ID': auth.requestId } : {}),
      },
      body: JSON.stringify({ question, top_k: topK, ...(auth ? { request_id: auth.requestId } : {}) }),
      signal: controller.signal,
    })
    clearTimeout(connectTimer)
    if (!response.ok) throw await parseError(response)
    if (!response.body) throw new ApiError('浏览器不支持当前流式响应。', undefined, 'STREAM_UNAVAILABLE')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = new SSEFrameParser()
    let done = false
    refreshIdle()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      refreshIdle()
      for (const frame of parser.feed(decoder.decode(chunk.value, { stream: true }))) {
        if (!['status', 'delta', 'citations', 'done', 'error'].includes(frame.event)) continue
        const event = { event: frame.event, data: frame.data } as ChatStreamEvent
        onEvent(event)
        if (event.event === 'error') throw new ApiError('服务未能完成请求。', undefined, event.data.code)
        if (event.event === 'done') done = true
      }
      if (done) break
    }
    if (!done) {
      for (const frame of parser.feed(decoder.decode())) {
        if (frame.event === 'done') { onEvent({ event: 'done', data: frame.data } as ChatStreamEvent); done = true }
      }
      parser.finish()
    }
    if (!done) throw new ApiError('流式响应中断，本次回答未完成。', undefined, 'STREAM_INTERRUPTED')
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal?.aborted) throw new ApiError('已停止生成。', undefined, 'USER_STOPPED')
    if (timeoutKind) throw new ApiError(
      timeoutKind === 'connect' ? '连接等待超时。' : timeoutKind === 'idle' ? '模型长时间没有新输出。' : '回答总时长超限。',
      undefined, 'STREAM_TIMEOUT',
    )
    throw new ApiError('网络连接中断，本次回答未完成。', undefined, 'STREAM_NETWORK_ERROR')
  } finally {
    clearTimeout(connectTimer)
    clearTimeout(totalTimer)
    clearTimeout(idleTimer)
    signal?.removeEventListener('abort', onAbort)
    if (reader) await reader.cancel().catch(() => undefined)
  }
}
