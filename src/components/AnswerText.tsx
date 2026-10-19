import type { ReactNode } from 'react'

interface AnswerTextProps {
  text: string
}

const paragraphLimit = 110

export function splitReadableParagraph(text: string): string[] {
  // Do not cut through an inline Markdown span that itself contains sentence
  // punctuation; preserving formatting is more important than forcing a split.
  const inlineSpans = text.match(/\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*/g) ?? []
  if (inlineSpans.some((span) => /[。！？；]/.test(span))) return [text]
  const sentences = text.match(/[^。！？；]+[。！？；]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [text]
  if (sentences.length < 2) return [text]
  const paragraphs: string[] = []
  let current = ''
  let sentenceCount = 0
  for (const sentence of sentences) {
    if (current && (current.length + sentence.length > paragraphLimit || sentenceCount >= 3)) {
      paragraphs.push(current)
      current = ''
      sentenceCount = 0
    }
    current += sentence
    sentenceCount += 1
  }
  if (current) paragraphs.push(current)
  return paragraphs
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

export function AnswerText({ text }: AnswerTextProps) {
  const lines = text.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = (lines[index] ?? '').trim()
    if (!line) { index += 1; continue }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const Tag = `h${(heading[1] ?? '#').length + 1}` as 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={index}>{inline(heading[2] ?? '')}</Tag>)
      index += 1
      continue
    }

    const listItem = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/)
    if (listItem) {
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items: ReactNode[] = []
      while (index < lines.length) {
        const item = (lines[index] ?? '').trim().match(ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/)
        if (!item) break
        items.push(<li key={index}>{inline(item[1] ?? '')}</li>)
        index += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={`list-${index}`}>{items}</List>)
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && (lines[index] ?? '').trim() && !/^(#{1,3})\s+/.test((lines[index] ?? '').trim()) && !/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[index] ?? '')) {
      paragraph.push((lines[index] ?? '').trim())
      index += 1
    }
    splitReadableParagraph(paragraph.join(' ')).forEach((part, partIndex) => {
      blocks.push(<p key={`p-${index}-${partIndex}`}>{inline(part)}</p>)
    })
  }

  return <div className="answer-text">{blocks}</div>
}
