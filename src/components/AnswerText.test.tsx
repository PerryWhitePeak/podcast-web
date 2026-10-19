import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnswerText, splitReadableParagraph } from './AnswerText'

describe('AnswerText', () => {
  it('renders headings, paragraphs and ordered or unordered lists as structure', () => {
    const html = renderToStaticMarkup(<AnswerText text={'## 访谈观点\n一段说明。\n\n- 第一项\n- 第二项\n\n1. 步骤一\n2. 步骤二'} />)
    expect(html).toContain('<h3>访谈观点</h3>')
    expect(html.match(/<ul>/g)).toHaveLength(1)
    expect(html.match(/<li>/g)).toHaveLength(4)
    expect(html).toContain('<ol>')
    expect(html).toContain('<p>一段说明。</p>')
  })

  it('formats inline emphasis without interpreting raw HTML', () => {
    const html = renderToStaticMarkup(<AnswerText text={'**重点** 与 `原文` <img src=x onerror=alert(1)>'} />)
    expect(html).toContain('<strong>重点</strong>')
    expect(html).toContain('<code>原文</code>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('splits a long answer at sentence boundaries without changing its text', () => {
    const source = '第一句说明访谈观点。第二句说明这只是当事人的主张。第三句继续交代边界。第四句明确模型推断。第五句提醒仍需外部证据。'
    const parts = splitReadableParagraph(source)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.join('')).toBe(source)
    const html = renderToStaticMarkup(<AnswerText text={source} />)
    expect(html.match(/<p>/g)?.length).toBe(parts.length)
  })

  it('does not split through an inline Markdown span', () => {
    const source = '**第一句需要强调。第二句仍属于同一强调范围。** 后续说明。'
    expect(splitReadableParagraph(source)).toEqual([source])
  })
})
