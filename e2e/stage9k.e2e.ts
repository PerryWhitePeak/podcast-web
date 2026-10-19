import { expect, test, type Page, type Route } from '@playwright/test'

const health = {
  status: 'ok', schema_version: '1.0', canonical_source_current: true,
  keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'mock',
  llm_provider: 'mock', llm_configured: true, audio_available: true,
  audio_filename: 'fixture.wav', audio_media_type: 'audio/wav', audio_duration_seconds: 30,
}

const citation = {
  citation_id: 'ev_stage9k_internal', speaker: '嘉宾', speaker_confirmed: true,
  quote: '这是一段可核对的访谈原文。', paragraph_id: 'par_private', turn_id: 'turn_private',
  display_timestamp: '00:00:05',
  source: { path: 'D:/PRIVATE/authoritative.md', markdown_sha256: 'PRIVATE_HASH', line_start: 8, line_end: 9 },
  alignment_status: 'accurate', audio_start: 5, audio_end: 8,
  candidate_audio_start: null, candidate_audio_end: null,
  audio_url: '/api/media/audio', playback_available: true,
}

const response = {
  question: '测试', answer: '这是正常回答。', content_type: 'grounded', answer_origin: 'model',
  citations: [citation],
  retrieval: { question: '测试', mode_requested: 'hybrid', mode_used: 'hybrid', semantic_error: null, results: [] },
  answer_completeness: { status: 'not_applicable', action_request: false, human_review: false, reason: '' },
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function baseRoutes(page: Page) {
  await page.route('**/api/health', (route) => json(route, health))
  await page.route('**/api/media/audio', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(64) }))
}

test('正常请求只显示白名单状态，引用不泄露内部路径', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop fault-injection suite')
  await baseRoutes(page)
  await page.route('**/api/chat/stream', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: frame('status', { phase: 'generating', message: 'PRIVATE VALIDATOR: checking ev_stage9k_internal' })
      + frame('delta', { text: response.answer, validation: 'citation_quote_speaker_checks_passed' })
      + frame('done', { response, safety_buffered: true }),
  }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('正常请求')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('这是正常回答。')).toBeVisible()
  await page.locator('.citations-group > summary').click()
  await expect(page.locator('.citation-source')).toContainText('访谈逐字稿 · 第 8–9 行')
  await expect(page.locator('body')).not.toContainText('PRIVATE VALIDATOR')
  await expect(page.locator('body')).not.toContainText('D:/PRIVATE')
  await expect(page.locator('body')).not.toContainText('ev_stage9k_internal')
})

test('网络中断与 SSE 中途断开均保留问题且不自动重发', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop fault-injection suite')
  await baseRoutes(page)
  let calls = 0
  await page.route('**/api/chat/stream', async (route) => {
    calls += 1
    if (calls === 1) return route.abort('connectionreset')
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frame('delta', { text: '不完整片段', validation: 'citation_quote_speaker_checks_passed' }),
    })
  })
  await page.goto('/agent')

  await page.getByLabel('输入问题').fill('网络中断问题')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('网络连接中断，本次内容没有完整收到。')).toBeVisible()
  await expect(page.getByLabel('输入问题')).toHaveValue('网络中断问题')
  expect(calls).toBe(1)

  await page.getByLabel('输入问题').fill('SSE 中断问题')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('回答传输中断，本次内容没有完整收到。')).toBeVisible()
  await expect(page.getByText('不完整片段')).toHaveCount(0)
  await expect(page.getByLabel('输入问题')).toHaveValue('SSE 中断问题')
  expect(calls).toBe(2)
})

test('HTTP 429/500/502 与引用校验失败均使用公开文案并仅手动重试', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop fault-injection suite')
  await baseRoutes(page)
  const scenarios = [
    { status: 429, code: 'LLM_DAILY_BUDGET_EXHAUSTED', expected: '今天的问答额度已用完' },
    { status: 500, code: 'INTERNAL_PRIVATE', expected: '服务暂时出现问题' },
    { status: 502, code: 'LLM_UPSTREAM_ERROR', expected: '问答服务暂时不稳定' },
  ]
  let calls = 0
  await page.route('**/api/chat/stream', (route) => {
    const current = scenarios[calls++]
    if (current) return json(route, { detail: { code: current.code, message: 'PRIVATE_STACK_TRACE ev_secret' } }, current.status)
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frame('error', { code: 'CITATION_VALIDATION_FAILED', message: 'PRIVATE_CITATION_REASON ev_secret' }),
    })
  })
  await page.goto('/agent')
  for (const [index, scenario] of scenarios.entries()) {
    const question = `HTTP ${scenario.status}`
    await page.getByLabel('输入问题').fill(question)
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.locator('.error-answer').last()).toContainText(scenario.expected)
    await expect(page.getByLabel('输入问题')).toHaveValue(question)
    expect(calls).toBe(index + 1)
  }
  await page.getByLabel('输入问题').fill('引用失败')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.error-answer').last()).toContainText('回答与访谈原文无法可靠对应')
  await expect(page.locator('.error-answer').last()).toContainText('不会自动重发')
  await expect(page.locator('body')).not.toContainText('PRIVATE_')
  await expect(page.locator('body')).not.toContainText('ev_secret')
  expect(calls).toBe(4)
})

test('重复点击发送只创建一次请求和一条用户消息', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop fault-injection suite')
  await baseRoutes(page)
  let calls = 0
  await page.route('**/api/chat/stream', async (route) => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 300))
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frame('done', { response, safety_buffered: true }),
    })
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('只发送一次')
  await page.getByRole('button', { name: '发送' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await expect(page.getByText('这是正常回答。')).toBeVisible()
  expect(calls).toBe(1)
  await expect(page.locator('.message-user')).toHaveCount(1)
})

test('手机端无 Web Crypto 时仍可发送', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile fallback suite')
  await page.addInitScript(() => {
    Object.defineProperty(window, 'crypto', { configurable: true, value: undefined })
  })
  await baseRoutes(page)
  let calls = 0
  await page.route('**/api/chat/stream', (route) => {
    calls += 1
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('done', { response, safety_buffered: true }) })
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('手机非安全上下文')
  await page.getByRole('button', { name: '发送' }).tap()
  await expect(page.getByText('这是正常回答。')).toBeVisible()
  expect(calls).toBe(1)
})
