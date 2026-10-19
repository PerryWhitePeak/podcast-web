import { expect, test } from '@playwright/test'

function sseAnswer(question: string, answer: string, origin: 'model' | 'evidence_extract') {
  const response = {
    question, answer, content_type: 'grounded', answer_origin: origin,
    citations: [], retrieval: { question, mode_requested: 'hybrid', mode_used: 'hybrid', results: [] },
    answer_completeness: { action_request: false, status: 'not_applicable' },
  }
  return [
    `event: status\ndata: ${JSON.stringify({ phase: 'retrieving', message: '正在检索访谈内容……' })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ text: answer, validation: 'safe_fallback' })}\n\n`,
    `event: citations\ndata: ${JSON.stringify({ items: [] })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ response, degraded: origin !== 'model' })}\n\n`,
  ].join('')
}

test('安全降级明确标出摘录来源，连续问题不混流', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop state flow')
  await page.route('**/api/chat/stream', async (route) => {
    const question = route.request().postDataJSON().question as string
    const degraded = question === '第一问'
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: sseAnswer(question, degraded ? '第一问的权威原文摘录。' : '第二问的直接回答。', degraded ? 'evidence_extract' : 'model') })
  })
  await page.goto('/agent')
  await page.getByLabel('输入问题').fill('第一问')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('证据摘录 · 安全降级')).toBeVisible()
  await expect(page.getByText('第一问的权威原文摘录。')).toBeVisible()
  await page.getByLabel('输入问题').fill('第二问')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('第二问的直接回答。')).toBeVisible()
  await expect(page.locator('.message-assistant')).toHaveCount(2)
  await expect(page.locator('.message-assistant').first()).not.toContainText('第二问的直接回答')
  await expect(page.locator('.message-assistant').last()).not.toContainText('第一问的权威原文摘录')
})
