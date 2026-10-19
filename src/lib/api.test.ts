import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, SSEFrameParser, askQuestion, askQuestionStream, searchTranscript } from './api'
import { errorLabel } from './format'

afterEach(() => vi.unstubAllGlobals())

describe('API contract', () => {
  it('parses SSE events split across byte and frame boundaries', () => {
    const parser = new SSEFrameParser()
    const chunks = ['event: delta\r', '\ndata: {"text":"第一段。","validation":"citation_quote_speaker_checks_passed"}\r', '\n\r', '\nevent: done\ndata: {"response":{}}\n\n']
    const frames = chunks.flatMap((part) => parser.feed(part))
    parser.finish()
    expect(frames.map((item) => item.event)).toEqual(['delta', 'done'])
    expect(frames[0]?.data).toEqual({ text: '第一段。', validation: 'citation_quote_speaker_checks_passed' })
  })

  it('appends locally checked stream deltas before the completion event', async () => {
    const encoder = new TextEncoder()
    const frames = [
      'event: status\ndata: {"phase":"retrieving","message":"检索中"}\n\n',
      'event: delta\ndata: {"text":"第一段。","validation":"citation_quote_speaker_checks_passed"}\n\n',
      'event: delta\ndata: {"text":"\\n\\n第二段。","validation":"citation_quote_speaker_checks_passed"}\n\n',
      'event: done\ndata: {"response":{"answer":"第一段。\\n\\n第二段。"},"safety_buffered":true}\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream({
      start(controller) { frames.forEach((frame) => controller.enqueue(encoder.encode(frame))); controller.close() },
    }) }))
    const seen: string[] = []
    await askQuestionStream('测试问题', 5, (event) => seen.push(event.event === 'delta' ? event.data.text : event.event))
    expect(seen).toEqual(['status', '第一段。', '\n\n第二段。', 'done'])
  })

  it('marks a broken stream incomplete and never retries it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: delta\ndata: {"text":"安全段落","validation":"citation_quote_speaker_checks_passed"}\n\n')); controller.close() },
    }) })
    vi.stubGlobal('fetch', fetchMock)
    const seen: string[] = []
    await expect(askQuestionStream('测试问题', 5, (event) => { if (event.event === 'delta') seen.push(event.data.text) }))
      .rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
    expect(seen).toEqual(['安全段落'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('marks an idle streaming response incomplete without retrying', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: RequestInfo | URL, init: RequestInit) => Promise.resolve({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
        },
      }),
    } as Response))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const pending = askQuestionStream('流式空闲测试', 5, () => undefined)
      const rejection = expect(pending).rejects.toMatchObject({ code: 'STREAM_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(60_001)
      await rejection
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the active fetch when the user stops generation', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = askQuestionStream('停止测试', 5, () => undefined, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'USER_STOPPED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends only the backend-declared fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ question: '测试', results: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await searchTranscript('测试', 3)
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body)).toEqual({ question: '测试', top_k: 3 })
  })

  it('preserves structured backend errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: { code: 'LLM_NOT_CONFIGURED', message: 'missing' } }),
      }),
    )
    await expect(askQuestion('测试')).rejects.toMatchObject({
      status: 503,
      code: 'LLM_NOT_CONFIGURED',
      message: '服务未能完成请求。',
    })
  })

  it.each([429, 500, 502])('classifies an HTTP %s response without exposing its body', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => { throw new SyntaxError(`PRIVATE_HTTP_${status}`) },
    }))
    let error: unknown
    try { await askQuestion('故障注入') } catch (reason) { error = reason }
    expect(error).toMatchObject({ code: `HTTP_${status}`, message: '服务未能完成请求。' })
    expect(errorLabel(error)).not.toContain('PRIVATE_HTTP')
  })

  it('ends a stalled request at the client timeout and leaves retry explicit', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const pending = askQuestion('超时测试')
    const rejection = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(30_000)
    await rejection
    expect(errorLabel(new ApiError('private upstream detail', 502, 'UNKNOWN_INTERNAL'))).toBe('服务暂时无法完成请求，请稍后手动重试。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('keeps the timeout active while reading a stalled response body', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    } as Response))
    vi.stubGlobal('fetch', fetchMock)
    const pending = askQuestion('响应体超时测试')
    const rejection = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(30_000)
    await rejection
    vi.useRealTimers()
  })

  it('does not expose malformed response details to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('private parser detail') } }))
    let error: unknown
    try { await askQuestion('格式错误测试') } catch (reason) { error = reason }
    expect(error).toBeInstanceOf(SyntaxError)
    expect(errorLabel(error)).toBe('发生未知错误，请稍后手动重试。')
  })
})
