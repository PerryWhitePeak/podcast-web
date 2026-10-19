import { expect, test, type Page, type Route } from '@playwright/test'

const health = {
  status: 'ok', schema_version: '1.0', canonical_source_current: true,
  keyword_index_ready: true, semantic_index_ready: true, semantic_model: 'fixture',
  llm_provider: 'mock', llm_configured: true, audio_available: true,
  audio_filename: 'podcast.m4a', audio_media_type: 'audio/mp4', audio_duration_seconds: 15749,
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
}

async function installApi(page: Page) {
  await page.route('**/api/health', (route) => json(route, health))
  await page.route('**/api/media/audio', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.alloc(64) }))
  await page.route('**/api/chat/stream', (route) => {
    const response = { question: '认知是什么？', answer: '认知决定命运。', content_type: 'grounded', answer_origin: 'evidence_extract', citations: [], retrieval: { question: '认知是什么？', mode_requested: 'hybrid', mode_used: 'keyword_fallback', semantic_error: null, results: [] }, answer_completeness: { status: 'complete', action_request: false, human_review: false, reason: 'fixture' } }
    const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame('delta', { text: response.answer }) + frame('citations', { items: [] }) + frame('done', { response, safety_buffered: true }) })
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__audioPlayCalls', { value: 0, writable: true })
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      ;(window as typeof window & { __audioPlayCalls: number }).__audioPlayCalls += 1
      return original.apply(this, args)
    }
  })
  await installApi(page)
})

test('主页三大入口真实跳转、响应式布局与无声开场均可用', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /孙宇晨.*邵艾伦/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /阅读访谈稿/ })).toHaveAttribute('href', '/transcript')
  await expect(page.getByRole('link', { name: /向 AI 提问/ })).toHaveAttribute('href', '/agent')
  await expect(page.getByRole('link', { name: /观看原片/ })).toHaveAttribute('href', /bilibili/)
  await expect(page.getByText('高清访谈画面待接入')).toHaveCount(0)
  await expect(page.locator('.stage8-hero-visual img:visible')).toHaveCount(testInfo.project.name.includes('mobile') ? 2 : 1)
  await expect.poll(() => page.locator('.stage8-hero-visual img:visible').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await page.locator('.stage8-hero-visual img:visible').evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())))
  await page.waitForTimeout(900)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const agentBox = await page.getByRole('link', { name: /向 AI 提问/ }).boundingBox()
  const transcriptBox = await page.getByRole('link', { name: /阅读访谈稿/ }).boundingBox()
  const videoBox = await page.getByRole('link', { name: /观看原片/ }).boundingBox()
  expect(agentBox && transcriptBox && videoBox).toBeTruthy()
  if (!testInfo.project.name.includes('mobile')) {
    expect(agentBox!.height).toBeGreaterThan(transcriptBox!.height * 1.5)
    expect(transcriptBox!.x).toBeGreaterThan(agentBox!.x)
  } else {
    expect(transcriptBox!.y).toBeGreaterThan(agentBox!.y)
    expect(videoBox!.y).toBeGreaterThan(transcriptBox!.y)
  }

  if (testInfo.project.name === 'desktop' || testInfo.project.name === 'mobile') {
    await page.screenshot({
      path: testInfo.project.name === 'desktop' ? 'e2e/artifacts/stage8b-home-desktop.png' : 'e2e/artifacts/stage8b-home-mobile.png',
      fullPage: true,
    })
  }
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioPlayCalls: number }).__audioPlayCalls)).toBe(0)

  await page.getByRole('link', { name: /向 AI 提问/ }).click()
  await expect(page).toHaveURL(/\/agent$/)
  await page.goto('/')
  await page.getByRole('link', { name: /阅读访谈稿/ }).click()
  await expect(page).toHaveURL(/\/transcript$/)
  await page.goto('/')

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: /观看原片/ }).click()
  const popup = await popupPromise
  await expect.poll(() => popup.url()).toMatch(/bilibili\.com\/video\/BV1fcHD6cEw3/)
  await popup.close()

  await page.getByRole('button', { name: /观看 12 秒无声开场/ }).click()
  await expect(page.getByRole('dialog', { name: '薄肌理论开场' })).toBeVisible()
  await expect(page.getByLabel('无声模式')).toBeDisabled()
  await expect(page.locator('.intro audio')).toHaveCount(0)
  await page.getByRole('button', { name: '跳过' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioPlayCalls: number }).__audioPlayCalls)).toBe(0)
})

test('首页人物图片缺失时提供可见降级且布局保持稳定', async ({ page }) => {
  await page.route(/\/(interview-duo|sun-yuchen|shao-ailun)\.png$/, (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('img', { name: /加载失败/ }).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('影像暂不可用').filter({ visible: true }).first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('访谈稿来自权威源并支持搜索、筛选和音频定位入口', async ({ page }, testInfo) => {
  await page.goto('/transcript')
  await expect(page.getByRole('heading', { name: '完整访谈稿' })).toBeVisible()
  await expect(page.getByText('682 个话轮')).toBeVisible()
  await page.getByLabel('搜索完整访谈稿').fill('认知决定命运')
  await expect(page.locator('.transcript-turn').first()).toContainText('认知决定命运')
  await expect(page.locator('mark').first()).toContainText('认知决定命运')
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioPlayCalls: number }).__audioPlayCalls)).toBe(0)
  if (testInfo.project.name === 'desktop') await expect(page.getByRole('navigation', { name: '时间节点' })).toBeVisible()
})

test('原 Agent 路径保留 Mock 流式问答流程', async ({ page }) => {
  await page.goto('/agent')
  await expect(page.getByText('Mock（明确测试模式）')).toBeVisible()
  await page.getByLabel('输入问题').fill('认知是什么？')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('.assistant-response').last()).toContainText('认知决定命运。')
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioPlayCalls: number }).__audioPlayCalls)).toBe(0)
})
