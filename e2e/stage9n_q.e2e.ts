import { expect, test, type Page, type Route } from '@playwright/test'

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const health = (auth = false) => ({
  status: 'ok', schema_version: '1.0', canonical_source_current: true,
  keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'offline',
  llm_provider: 'mock', llm_configured: true, auth_enabled: auth, auth_configured: auth,
  audio_available: true, audio_filename: 'fixture.wav', audio_media_type: 'audio/wav',
  audio_duration_seconds: 120,
})
const source = { path: '参考文献/完整逐字稿github.md', markdown_sha256: 'hash', line_start: 10, line_end: 11 }
const citation = {
  citation_id: 'ev_stage9n_q', speaker: '孙宇晨', speaker_confirmed: true,
  quote: '可核验的访谈原文。', paragraph_id: 'par_1', turn_id: 'turn_1',
  display_timestamp: '00:00:15', source, alignment_status: 'accurate',
  audio_start: 15, audio_end: 25, candidate_audio_start: null,
  candidate_audio_end: null, audio_url: '/api/media/audio', playback_available: true,
}

async function mockHealth(page: Page, auth = false) {
  await page.route('**/api/health', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(health(auth)),
  }))
  if (auth) await page.route('**/api/auth/me', (route: Route) => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ detail: { code: 'AUTH_REQUIRED' } }),
  }))
}

test('fixed reply works before login and does not expose an audio player', async ({ page }) => {
  await mockHealth(page, true)
  let posted = 0
  await page.route('**/api/chat/stream', (route: Route) => {
    posted += 1
    const response = {
      question: '你是什么模型', answer: '我是访谈网站助手；底层模型版本未在界面中提供。',
      content_type: 'mixed', answer_origin: 'fixed', answer_mode: 'basic_conversation', model_used: false,
      citations: [], retrieval: { question: '你是什么模型', mode_requested: 'not_applicable', mode_used: 'fixed_response', semantic_error: null, results: [] },
      answer_completeness: { status: 'not_applicable', action_request: false, human_review: false, reason: 'fixed' },
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('delta', { text: response.answer, validation: 'fixed_response' }) + frame('citations', { items: [] }) + frame('done', { response, safety_buffered: true }) })
  })
  await page.goto('/agent')
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
  await page.getByLabel('输入问题').fill('你是什么模型')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('底层模型版本未在界面中提供', { exact: false })).toBeVisible()
  await expect(page.getByLabel('账号与问答额度')).toHaveCount(0)
  await expect(page.locator('.agent-audio-popover')).toHaveCount(0)
  expect(posted).toBe(1)
})

test('valid citation opens the mini player, switches timestamp and closes cleanly', async ({ page }) => {
  await mockHealth(page)
  const response = {
    question: '孙宇晨如何理解薄肌理论', answer: '这是带证据的回答。',
    content_type: 'grounded', answer_origin: 'model', answer_mode: 'interview_knowledge', model_used: true,
    citations: [citation], retrieval: { question: '问题', mode_requested: 'hybrid', mode_used: 'hybrid', semantic_error: null, results: [] },
    answer_completeness: { status: 'not_applicable', action_request: false, human_review: false, reason: '' },
  }
  await page.route('**/api/chat/stream', (route: Route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: frame('delta', { text: response.answer, validation: 'citation_quote_speaker_checks_passed' }) + frame('citations', { items: [citation] }) + frame('done', { response, safety_buffered: true }),
  }))
  await page.route('**/api/media/audio', (route: Route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(44) }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill(response.question)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.locator('.citations-group > summary').click()
  await page.locator('.play-citation').click()
  const player = page.locator('.agent-audio-popover')
  await expect(player).toBeVisible()
  await expect(player).toContainText('孙宇晨 · 00:00:15')
  await expect(player.getByLabel('音频进度')).toBeVisible()
  await player.getByRole('button', { name: '关闭音频播放器' }).click()
  await expect(player).toHaveCount(0)
})

test('an interrupted SSE draft is removed instead of presented as a completed answer', async ({ page }) => {
  await mockHealth(page)
  await page.route('**/api/chat/stream', (route: Route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: frame('delta', { text: '不应保留的未完成草稿', validation: 'citation_quote_speaker_checks_passed' }),
  }))
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('孙宇晨怎么看 AI')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('本次回答未完成')).toBeVisible()
  await expect(page.getByText('不应保留的未完成草稿')).toHaveCount(0)
})
