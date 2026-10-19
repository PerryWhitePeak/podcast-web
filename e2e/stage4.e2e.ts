import { expect, test, type Page, type Route } from '@playwright/test'

const source = {
  path: '参考文献/完整逐字稿github.md',
  markdown_sha256: '9E85AB9867FA38DF5684D4C47C8FED22377CCBA32655E78B1D6CE23BC14FDEDF',
  line_start: 25,
  line_end: 25,
}

const accurateCitation = {
  citation_id: 'ev_stage4_accurate', speaker: '孙宇晨', speaker_confirmed: true,
  quote: '认知决定命运。', paragraph_id: 'par_1', turn_id: 'turn_1', display_timestamp: '00:00:15',
  source, alignment_status: 'accurate', audio_start: 0.02, audio_end: 0.12,
  candidate_audio_start: null, candidate_audio_end: null, audio_url: '/api/media/audio', playback_available: true,
}

const reviewCitation = {
  ...accurateCitation, citation_id: 'ev_stage4_review', quote: '候选时间待人工复核。',
  alignment_status: 'needs_review', audio_start: null, audio_end: null,
  candidate_audio_start: 1, candidate_audio_end: 2, audio_url: null, playback_available: false,
}

const unmatchedCitation = {
  ...accurateCitation, citation_id: 'ev_stage4_unmatched', quote: '没有可靠时间定位。',
  alignment_status: 'unmatched', audio_start: null, audio_end: null,
  candidate_audio_start: null, candidate_audio_end: null, audio_url: null, playback_available: false,
}

const health = {
  status: 'ok', schema_version: '1.0', canonical_source_current: true,
  keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'BAAI/bge-m3',
  llm_provider: 'mock', llm_configured: true, audio_available: true,
  audio_filename: 'fixture.wav', audio_media_type: 'audio/wav', audio_duration_seconds: 0.25,
}

const chatResponse = {
  question: '测试问题', answer: '可核验的访谈原文摘录。', content_type: 'grounded', answer_origin: 'evidence_extract',
  citations: [accurateCitation],
  retrieval: { question: '测试问题', mode_requested: 'hybrid', mode_used: 'hybrid', semantic_error: null, results: [] },
  answer_completeness: { status: 'pending_human_review', action_request: true, human_review: true, reason: 'fixture' },
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

function stream(route: Route, response: typeof chatResponse) {
  const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const body = frame('status', { phase: 'retrieving', message: '正在检索访谈内容……' })
    + frame('status', { phase: 'generating', message: '正在生成回答并逐段核验……' })
    + frame('delta', { text: response.answer, validation: 'citation_quote_speaker_checks_passed' })
    + frame('citations', { items: response.citations })
    + frame('done', { response, safety_buffered: true })
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body })
}

function wavFixture(seconds = 0.25): Buffer {
  const sampleRate = 8000
  const samples = Math.floor(sampleRate * seconds)
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8)
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

async function serveRangeCapableWav(route: Route, seconds: number) {
  const body = wavFixture(seconds)
  const range = route.request().headers().range
  const match = range?.match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body })
  const start = Number(match[1])
  const end = Math.min(match[2] ? Number(match[2]) : body.length - 1, body.length - 1)
  const chunk = body.subarray(start, end + 1)
  return route.fulfill({
    status: 206,
    contentType: 'audio/wav',
    headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': String(chunk.length) },
    body: chunk,
  })
}

async function installMockApi(page: Page, options: { failFirstChat?: boolean; delayedChat?: boolean; origins?: Array<'model' | 'evidence_extract' | 'safety_fallback'> } = {}) {
  let chatCalls = 0
  await page.route('**/api/health', (route) => json(route, health))
  await page.route('**/api/media/audio', (route) => route.fulfill({
    status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: wavFixture(),
  }))
  await page.route('**/api/search', (route) => json(route, {
    question: '时间测试', mode_requested: 'hybrid', mode_used: 'keyword_fallback', semantic_error: 'fixture degradation',
    results: [{
      rank: 1, chunk_id: 'chk_stage4', content: '测试检索结果', speakers: ['孙宇晨'], turn_ids: ['turn_1'],
      score: 0.03, alignment_status: 'mixed', audio_start: null, audio_end: null, playback_available: false,
      evidence: [reviewCitation, unmatchedCitation],
    }],
  }))
  await page.route('**/api/chat/stream', async (route) => {
    chatCalls += 1
    if (options.delayedChat) await new Promise((resolve) => setTimeout(resolve, 500))
    if (options.failFirstChat && chatCalls === 1) {
      return json(route, { detail: { code: 'LLM_UPSTREAM_ERROR', message: 'fixture failure' } }, 502)
    }
    const origin = options.origins?.[chatCalls - 1]
    return stream(route, origin ? { ...chatResponse, answer_origin: origin, citations: origin === 'safety_fallback' ? [] : chatResponse.citations, content_type: origin === 'safety_fallback' ? 'insufficient' : 'grounded' } : chatResponse)
  })
  return () => chatCalls
}

test('Mock API 桌面主流程、引用与后端 Range 契约', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only live smoke')
  await installMockApi(page)
  await page.goto('/agent')

  await page.getByLabel('搜索逐字稿').fill('财富自由之后应该做什么')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.locator('.search-hit').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.search-hit').first().locator('code')).toHaveCount(0)
  await page.locator('.search-hit').first().locator('summary').click()
  await expect(page.locator('.search-hit').first().locator('.citation-card').first()).toContainText('候选时间待人工复核。')
  await expect(page.locator('.search-hit').first()).not.toContainText('ev_')
  await expect(page.locator('.search-hit').first()).not.toContainText('chk_')
  await expect(page.locator('.search-hit').first().locator('.citation-source').first()).toContainText('访谈逐字稿')

  await page.getByLabel('输入问题').fill('孙宇晨如何理解财富自由？')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('根据访谈原文整理')).toBeVisible()
  await page.locator('.assistant-response .citations-group > summary').click()
  await expect(page.locator('.assistant-response .citation-card').first()).toBeVisible()
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
  await expect(page.locator('.agent-shell audio')).toHaveCount(0)
  await page.screenshot({ path: 'e2e/artifacts/desktop-live.png', fullPage: true })

  const livePlay = page.locator('.assistant-response .play-citation').first()
  await expect(livePlay).toBeVisible()
  const playbackLabel = await livePlay.textContent()
  const stamp = playbackLabel?.match(/播放\s+(?:(\d+):)?(\d+):(\d+)/)
  expect(stamp).not.toBeNull()
  const citationStart = Number(stamp?.[1] ?? 0) * 3600 + Number(stamp?.[2]) * 60 + Number(stamp?.[3])
  await livePlay.click()
  await expect(page.locator('.agent-audio-popover')).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭音频播放器' })).toBeVisible()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.currentTime), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(citationStart - 1)
  const partial = await request.get('http://127.0.0.1:8000/api/media/audio', { headers: { Range: 'bytes=0-99' } })
  expect(partial.status()).toBe(206)
  expect(partial.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/)
  expect(partial.headers()['content-length']).toBe('100')
  expect((await partial.body()).length).toBe(100)
  const invalid = await request.get('http://127.0.0.1:8000/api/media/audio', { headers: { Range: 'bytes=999999999-1000000000' } })
  expect(invalid.status()).toBe(416)
  expect(invalid.headers()['content-range']).toMatch(/^bytes \*\/\d+$/)
})

test('三种回答来源分别标记，安全答复不带引用且不能播放音频', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only source labels')
  await installMockApi(page, { origins: ['model', 'evidence_extract', 'safety_fallback'] })
  await page.goto('/agent')
  for (const [question, label] of [
    ['模型回答测试', 'AI 回答'],
    ['证据摘录测试', '根据访谈原文整理'],
    ['安全答复测试', '当前材料不足'],
  ]) {
    await page.getByLabel('输入问题').fill(question)
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.locator('.assistant-response').last().locator('.answer-kicker')).toContainText(label)
  }
  const safe = page.locator('.assistant-response').last()
  await expect(safe.locator('.citation-card')).toHaveCount(0)
  await expect(safe.locator('.play-citation')).toHaveCount(0)
})

test('失败重试、加载态、快速提交与三档音频权限', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only deterministic interaction')
  const calls = await installMockApi(page, { failFirstChat: true, delayedChat: true })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('测试问题')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('正在查找相关访谈内容……')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByText('本次回答未完成', { exact: true })).toBeVisible()
  expect(calls()).toBe(1)
  await page.getByRole('button', { name: /手动重试/ }).click()
  await expect(page.getByText('可核验的访谈原文摘录。')).toBeVisible()
  await expect(page.getByText('根据访谈原文整理')).toBeVisible()
  await page.locator('.assistant-response .citations-group > summary').click()
  expect(calls()).toBe(2)

  await page.getByLabel('搜索逐字稿').fill('时间测试')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page.locator('.search-hit summary').click()
  await expect(page.getByText(/音频时间尚未确认/)).toBeVisible()
  await expect(page.getByText('这段原文暂不提供音频跳转')).toBeVisible()
  await expect(page.locator('.search-hit .play-citation')).toHaveCount(0)

  await page.locator('.assistant-response .play-citation').click()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThanOrEqual(0.1)
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
})

test('后端离线提示可见且不泄漏实现细节', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only offline state')
  await page.route('**/api/health', (route) => route.abort('connectionrefused'))
  await page.route('**/api/media/audio', (route) => route.abort('connectionrefused'))
  await page.goto('/agent')
  await expect(page.getByRole('button', { name: '服务暂不可用' })).toBeVisible()
  await page.getByRole('button', { name: '服务暂不可用' }).click()
  await expect(page.getByText(/服务暂时无法完成请求/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('PODCAST_LLM_API_KEY')
})

test('移动端标签切换和水平溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile-only layout')
  await installMockApi(page)
  await page.goto('/agent')
  await expect(page.getByRole('navigation', { name: '页面区域' })).toBeVisible()
  await page.getByRole('button', { name: '逐字稿搜索' }).click()
  await expect(page.getByRole('region', { name: '逐字稿搜索' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'AI 问答' })).toBeHidden()
  await page.getByRole('button', { name: 'AI 问答' }).click()
  await expect(page.getByRole('region', { name: 'AI 问答' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'e2e/artifacts/mobile.png', fullPage: true })
})

test('连续提问保留各自回答，并显示 Stage 5Q 人工复核状态', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only sequential chat')
  let calls = 0
  await page.route('**/api/health', (route) => json(route, health))
  await page.route('**/api/media/audio', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wavFixture() }))
  await page.route('**/api/chat/stream', async (route) => {
    calls += 1
    const body = route.request().postDataJSON() as { question: string }
    const citation = { ...accurateCitation, citation_id: `ev_message${calls}`, quote: `关联引文 ${calls}` }
    return stream(route, { ...chatResponse, question: body.question, answer: `回答 ${calls}`, citations: [citation] })
  })
  await page.goto('/agent')
  for (const [index, question] of ['第一个问题', '第二个问题'].entries()) {
    await page.getByLabel('输入问题').fill(question)
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText(`回答 ${index + 1}`)).toBeVisible()
  }
  await expect(page.locator('.message-user')).toHaveCount(2)
  await expect(page.locator('.assistant-response')).toHaveCount(2)
  await page.locator('.assistant-response .citations-group > summary').first().click()
  await page.locator('.assistant-response .citations-group > summary').nth(1).click()
  await expect(page.locator('.assistant-response').nth(0)).toContainText('关联引文 1')
  await expect(page.locator('.assistant-response').nth(1)).toContainText('关联引文 2')
  await expect(page.locator('.completeness-note')).toHaveCount(2)
  await expect(page.locator('.completeness-note').first()).toContainText('结合你的实际情况判断')
})

test('本地 FastAPI 与 Mock Provider 完整问答链路', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'one live local Mock RAG smoke')
  const healthResponse = await request.get('http://127.0.0.1:8000/api/health')
  expect(healthResponse.ok()).toBeTruthy()
  expect((await healthResponse.json()).llm_provider).toBe('mock')
  await page.goto('/agent')
  const send = page.getByRole('button', { name: '发送' })
  await expect(send).toBeDisabled()
  await page.getByLabel('输入问题').fill('   ')
  await expect(send).toBeDisabled()
  await page.getByLabel('输入问题').fill('财富自由是什么？')
  await send.click()
  await expect(page.locator('.assistant-response').first()).toBeVisible({ timeout: 120_000 })
  await page.locator('.assistant-response .citations-group > summary').first().click()
  await expect(page.locator('.assistant-response').first().locator('.citation-card').first()).toBeVisible()
  await expect(page.locator('.assistant-response').first().locator('.citation-source').first()).toContainText('访谈逐字稿')
  await expect(page.locator('.assistant-response').first()).not.toContainText('ev_')
  await expect(page.locator('body')).not.toContainText('PODCAST_LLM_API_KEY')
})

test('手机端可提交问题并查看引用', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile-only chat flow')
  await installMockApi(page)
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('手机提问测试')
  await page.getByRole('button', { name: '发送' }).tap()
  await page.locator('.assistant-response .citations-group > summary').click()
  await expect(page.locator('.assistant-response .citation-card').first()).toBeVisible()
  await expect(page.locator('.assistant-response .play-citation').first()).toBeVisible()
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
  await page.locator('.assistant-response .play-citation').first().tap()
  await expect(page.locator('.agent-audio-popover')).toBeVisible()
  const playerBox = await page.locator('.agent-audio-popover').boundingBox()
  const composerBox = await page.locator('.composer').boundingBox()
  expect(playerBox && composerBox).toBeTruthy()
  expect(playerBox!.y + playerBox!.height).toBeLessThanOrEqual(composerBox!.y)
  await page.getByRole('button', { name: '关闭音频播放器' }).tap()
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
})

test('多条准确引用各自定位并在片段末尾暂停', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-only multi-citation playback')
  const first = { ...accurateCitation, citation_id: 'ev_first', audio_start: 0.1, audio_end: 0.35 }
  const second = { ...accurateCitation, citation_id: 'ev_second', audio_start: 0.8, audio_end: 1.2 }
  await page.route('**/api/health', (route) => json(route, { ...health, audio_duration_seconds: 2 }))
  await page.route('**/api/media/audio', (route) => serveRangeCapableWav(route, 2))
  await page.route('**/api/chat/stream', (route) => stream(route, { ...chatResponse, answer: '两条证据。', citations: [first, second] }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('两条引用测试')
  await page.getByRole('button', { name: '发送' }).click()
  await page.locator('.assistant-response .citations-group > summary').click()
  const playButtons = page.locator('.assistant-response .play-citation')
  await expect(playButtons).toHaveCount(2)
  const audio = page.locator('audio')
  await playButtons.nth(0).click()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(false)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThanOrEqual(0.08)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  expect(await audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeLessThan(0.5)
  await playButtons.nth(1).click()
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(false)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThanOrEqual(0.75)
  await expect.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  expect(await audio.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThanOrEqual(1.15)
})

test('真实 M4A 在浏览器中加载、按引用定位、播放控制并支持末尾 seek', async ({ page, request }, testInfo) => {
  const rangeResponses: Array<{ status: number; range: string | undefined }> = []
  const mediaRequests: Array<string | undefined> = []
  page.on('request', (browserRequest) => {
    if (browserRequest.url().includes('/api/media/audio')) mediaRequests.push(browserRequest.headers().range)
  })
  page.on('response', (response) => {
    if (response.url().includes('/api/media/audio')) rangeResponses.push({ status: response.status(), range: response.headers()['content-range'] })
  })
  await page.route('**/api/health', (route) => json(route, { ...health, audio_filename: 'podcast.m4a', audio_media_type: 'audio/mp4', audio_duration_seconds: 15749.336531 }))
  const actualCitations = [
    { ...accurateCitation, quote: '测试定位片段一', audio_start: 180, audio_end: 182 },
    { ...accurateCitation, citation_id: 'ev_stage6b_second', quote: '测试定位片段二', audio_start: 300, audio_end: 302 },
  ]
  await page.route('**/api/chat/stream', (route) => stream(route, { ...chatResponse, answer: 'M4A 播放兼容性专项测试。', citations: actualCitations }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('财富自由是什么？')
  await page.getByRole('button', { name: '发送' }).click()
  await page.locator('.assistant-response .citations-group > summary').click()
  await expect(page.locator('.assistant-response').first()).toBeVisible({ timeout: 120_000 })
  const citations = page.locator('.assistant-response .play-citation')
  await expect(citations.first()).toBeVisible({ timeout: 30_000 })
  // Stage 9N-Q loads the mini player only after the user chooses a valid
  // citation; this replaces the former permanently mounted page player.
  await citations.first().click()
  await expect.poll(() => page.locator('audio').evaluate((node: HTMLAudioElement) => node.readyState >= 1), { timeout: 60_000 }).toBe(true)
  const media = page.locator('audio')
  const metadata = await media.evaluate((node: HTMLAudioElement) => ({
    duration: node.duration,
    codecSupport: node.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
  }))
  expect(metadata.duration).toBeGreaterThan(1000)
  expect(metadata.codecSupport).not.toBe('')

  const firstText = await citations.first().textContent()
  const firstStart = firstText?.match(/播放\s+(?:(\d+):)?(\d+):(\d+)/)
  expect(firstStart).not.toBeNull()
  const startSeconds = Number(firstStart?.[1] ?? 0) * 3600 + Number(firstStart?.[2]) * 60 + Number(firstStart?.[3])
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => node.currentTime), { timeout: 60_000 }).toBeGreaterThanOrEqual(Math.max(0, startSeconds - 0.5))
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => !node.paused), { timeout: 20_000 }).toBe(true)
  await media.evaluate((node: HTMLAudioElement) => node.pause())
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => node.paused)).toBe(true)
  await media.evaluate((node: HTMLAudioElement) => node.play())
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => !node.paused), { timeout: 20_000 }).toBe(true)
  if (await citations.count() > 1) {
    const secondText = await citations.nth(1).textContent()
    const secondStart = secondText?.match(/播放\s+(?:(\d+):)?(\d+):(\d+)/)
    const secondSeconds = Number(secondStart?.[1] ?? 0) * 3600 + Number(secondStart?.[2]) * 60 + Number(secondStart?.[3])
    await citations.nth(1).click()
    await expect.poll(() => media.evaluate((node: HTMLAudioElement) => node.currentTime), { timeout: 60_000 }).toBeGreaterThanOrEqual(Math.max(0, secondSeconds - 0.5))
  }
  await media.evaluate((node: HTMLAudioElement) => node.pause())
  const slider = page.getByLabel('音频进度')
  await slider.focus()
  await page.keyboard.press('End')
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => node.currentTime >= node.duration - 1), { timeout: 60_000 }).toBe(true)
  await media.evaluate((node: HTMLAudioElement) => node.play())
  await expect.poll(() => media.evaluate((node: HTMLAudioElement) => node.ended || node.paused && node.currentTime >= node.duration - 0.5), { timeout: 20_000 }).toBe(true)
  const directRange = await request.get('http://127.0.0.1:8000/api/media/audio', { headers: { Range: 'bytes=0-99' } })
  expect(directRange.status()).toBe(206)
  expect(directRange.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/)
  test.info().annotations.push({ type: 'browser-media-http', description: JSON.stringify({ mediaRequests, rangeResponses }) })
})

test('指定桌面与手机视口无水平溢出且输入框可用', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'viewport sweep uses one browser context')
  await installMockApi(page)
  await page.goto('/agent')
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1366, height: 768 },
    { width: 390, height: 844 }, { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1)
    const input = page.getByLabel('输入问题')
    if (viewport.width < 600) await page.getByRole('button', { name: 'AI 问答' }).click()
    await expect(input).toBeVisible()
    await input.focus()
    await expect(input).toBeFocused()
  }
})
