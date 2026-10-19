import { expect, test, type Route } from '@playwright/test'

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

test('部署后桌面页面、真实 Mock SSE、引用与音频 Range 可用', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop deployment acceptance')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /孙宇晨.*邵艾伦/ })).toBeVisible()
  await page.getByRole('link', { name: /阅读访谈稿/ }).click()
  await expect(page).toHaveURL(/\/transcript$/)
  await expect(page.getByRole('heading', { name: '完整访谈稿' })).toBeVisible()
  await page.getByLabel('搜索完整访谈稿').fill('认知决定命运')
  await expect(page.locator('.transcript-turn').first()).toContainText('认知决定命运')

  let streamPosts = 0
  let requestId = ''
  page.on('request', (browserRequest) => {
    if (browserRequest.url().endsWith('/api/chat/stream') && browserRequest.method() === 'POST') streamPosts += 1
  })
  page.on('response', (response) => {
    if (response.url().endsWith('/api/chat/stream')) requestId = response.headers()['x-request-id'] ?? ''
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('财富自由是什么？')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.stream-response')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('可以先从访谈里与问题直接相关的观点入手。')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.assistant-response .citations-group')).toBeVisible({ timeout: 60_000 })
  expect(streamPosts).toBe(1)
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  await page.locator('.assistant-response .citations-group > summary').click()
  await expect(page.locator('.assistant-response .citation-card').first()).toBeVisible()
  await expect(page.locator('.assistant-response .citation-source').first()).toContainText('访谈逐字稿')
  await expect(page.locator('body')).not.toContainText(/PODCAST_|PRIVATE_|traceback|request_id/i)

  const play = page.locator('.assistant-response .play-citation').first()
  if (await play.count()) {
    await expect(page.locator('audio')).toHaveCount(0)
    await play.click()
    await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.readyState), { timeout: 60_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.currentTime), { timeout: 30_000 }).toBeGreaterThan(0)
  }

  const range = await request.get('/api/media/audio', { headers: { Range: 'bytes=0-99' } })
  expect(range.status()).toBe(206)
  expect(range.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/)
  expect((await range.body()).length).toBe(100)
})

test('needs_review 引用保留原文但禁止未经确认的音频跳转', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop citation safety acceptance')
  const citation = {
    citation_id: 'ev_stage9l_review', speaker: '嘉宾', speaker_confirmed: true,
    quote: '候选时间待人工复核。', paragraph_id: 'par_review', turn_id: 'turn_review',
    display_timestamp: '00:00:12', source: { path: 'D:/private/source.md', markdown_sha256: 'private', line_start: 10, line_end: 10 },
    alignment_status: 'needs_review', audio_start: null, audio_end: null,
    candidate_audio_start: 12, candidate_audio_end: 18, audio_url: null, playback_available: false,
  }
  const response = {
    question: '复核测试', answer: '仅展示已核对的原文边界。', content_type: 'grounded', answer_origin: 'evidence_extract',
    citations: [citation], retrieval: { question: '复核测试', mode_requested: 'hybrid', mode_used: 'keyword_fallback', semantic_error: null, results: [] },
    answer_completeness: { status: 'complete', action_request: false, human_review: false, reason: '' },
  }
  await page.route('**/api/chat/stream', (route: Route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: frame('delta', { text: response.answer }) + frame('citations', { items: response.citations }) + frame('done', { response, safety_buffered: true }),
  }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('复核测试')
  await page.getByRole('button', { name: '发送' }).click()
  await page.locator('.assistant-response .citations-group > summary').click()
  const card = page.locator('.assistant-response .citation-card').first()
  await expect(card).toContainText('候选时间待人工复核。')
  await expect(card).toContainText('音频时间尚未确认')
  await expect(card).toContainText('暂不提供跳转')
  await expect(card.locator('.play-citation')).toHaveCount(0)
  await expect(card).not.toContainText('D:/private')
  await expect(card).not.toContainText('ev_stage9l_review')
})

test('用户停止后撤回片段、保留问题且不自动重发', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop cancellation acceptance')
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    Object.defineProperty(window, '__stage9lStreamCalls', { configurable: true, value: 0, writable: true })
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (!url.endsWith('/api/chat/stream')) return originalFetch(input, init)
      ;(window as typeof window & { __stage9lStreamCalls: number }).__stage9lStreamCalls += 1
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: delta\ndata: {"text":"稍后应被撤回的片段"}\n\n'))
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('stopped', 'AbortError')), { once: true })
        },
      })
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    }) as typeof window.fetch
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('停止生成测试')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('稍后应被撤回的片段')).toBeVisible()
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByText('已停止生成', { exact: true })).toBeVisible()
  await expect(page.getByText('稍后应被撤回的片段')).toHaveCount(0)
  await expect(page.locator('.message-user')).toHaveCount(1)
  await expect(page.getByLabel('输入问题')).toHaveValue('停止生成测试')
  await expect(page.getByRole('button', { name: /手动重试/ })).toBeEnabled()
  expect(await page.evaluate(() => (window as typeof window & { __stage9lStreamCalls: number }).__stage9lStreamCalls)).toBe(1)
})

test('SSE 空闲超时后保留问题且不自动重发', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop timeout acceptance')
  await page.clock.install()
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    Object.defineProperty(window, '__stage9lStreamCalls', { configurable: true, value: 0, writable: true })
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (!url.endsWith('/api/chat/stream')) return originalFetch(input, init)
      ;(window as typeof window & { __stage9lStreamCalls: number }).__stage9lStreamCalls += 1
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('timeout', 'AbortError')), { once: true })
        },
      })
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    }) as typeof window.fetch
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('空闲超时测试')
  await page.getByRole('button', { name: '发送' }).click()
  await page.clock.fastForward(60_001)
  await expect(page.getByText('回答长时间没有新内容，本次没有完成。')).toBeVisible()
  await expect(page.getByLabel('输入问题')).toHaveValue('空闲超时测试')
  await expect(page.getByRole('button', { name: /手动重试/ })).toBeEnabled()
  expect(await page.evaluate(() => (window as typeof window & { __stage9lStreamCalls: number }).__stage9lStreamCalls)).toBe(1)
})

test('移动端局域网路径布局正常且无 Web Crypto 仍可发送', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile deployment acceptance')
  await page.addInitScript(() => Object.defineProperty(window, 'crypto', { configurable: true, value: undefined }))
  let calls = 0
  const response = {
    question: '移动端测试', answer: '移动端回答正常。', content_type: 'grounded', answer_origin: 'model', citations: [],
    retrieval: { question: '移动端测试', mode_requested: 'hybrid', mode_used: 'keyword_fallback', semantic_error: null, results: [] },
    answer_completeness: { status: 'complete', action_request: false, human_review: false, reason: '' },
  }
  await page.route('**/api/chat/stream', (route: Route) => {
    calls += 1
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('done', { response, safety_buffered: true }) })
  })
  for (const path of ['/', '/transcript', '/agent']) {
    await page.goto(path)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(1)
  }
  await page.getByRole('button', { name: 'AI 问答' }).click()
  await page.getByLabel('输入问题').fill('移动端测试')
  await page.getByRole('button', { name: '发送' }).tap()
  await expect(page.getByText('移动端回答正常。')).toBeVisible()
  expect(calls).toBe(1)
})
