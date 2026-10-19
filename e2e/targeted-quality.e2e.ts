import { expect, test, type Page, type Route } from '@playwright/test'

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

async function mockRuntime(page: Page) {
  await page.route('**/api/health', (route: Route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok', schema_version: '1.0', canonical_source_current: true,
      keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'offline',
      llm_provider: 'mock', llm_configured: true, audio_available: false,
      audio_filename: null, audio_media_type: null, audio_duration_seconds: null,
    }),
  }))
  const answer = '薄肌理论是访谈人物提出并解释的一套观点。仅凭访谈可以核实他确实这样表述，不能据此确认理论在现实中有效。现有片段没有给出独立验证、对照比较或可测量结果，因此把它直接判定为真理或噱头都超出了证据。模型只能据此指出论证边界，实际有效性仍需另外查证。'
  const response = {
    question: '搏击理论是不是噱头', answer, content_type: 'grounded', answer_origin: 'model', citations: [],
    retrieval: { question: '搏击理论是不是噱头', mode_requested: 'hybrid', mode_used: 'hybrid', semantic_error: null, results: [] },
    answer_completeness: { status: 'not_applicable', action_request: false, human_review: false, reason: '' },
  }
  await page.route('**/api/chat/stream', (route: Route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: frame('done', { response, safety_buffered: true }),
  }))
}

test('手机端回答、导航和输入区保持紧凑且长回答自然分段', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'targeted mobile regression')
  await mockRuntime(page)
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('搏击理论是不是噱头')
  await page.getByRole('button', { name: '发送' }).tap()
  await expect(page.getByText(/薄肌理论是访谈人物提出/)).toBeVisible()

  const metrics = await page.evaluate(() => {
    const style = (selector: string) => getComputedStyle(document.querySelector(selector) as Element)
    const rect = (selector: string) => (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
    const navRects = Array.from(document.querySelectorAll('.global-nav a'))
      .map((node) => (node as HTMLElement).getBoundingClientRect())
      .filter((item) => item.width > 0 && item.height > 0)
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      answerFont: parseFloat(style('.direct-answer .answer-text > p:first-child').fontSize),
      answerParagraphs: document.querySelectorAll('.direct-answer .answer-text > p').length,
      composerHeight: rect('.composer').height,
      tabsHeight: rect('.mobile-tabs').height,
      navOverlaps: navRects.some((item, index) => index > 0 && item.left < navRects[index - 1].right),
    }
  })
  expect(metrics.overflow).toBeLessThanOrEqual(1)
  expect(metrics.answerFont).toBeLessThanOrEqual(14)
  expect(metrics.answerParagraphs).toBeGreaterThanOrEqual(2)
  expect(metrics.composerHeight).toBeLessThanOrEqual(60)
  expect(metrics.tabsHeight).toBeLessThanOrEqual(36)
  expect(metrics.navOverlaps).toBe(false)
})
