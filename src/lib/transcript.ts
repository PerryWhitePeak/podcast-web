export interface TranscriptTurn {
  id: string
  timestamp: string
  seconds: number
  speaker: string
  content: string
  chapter: string
}

export interface TranscriptChapter {
  id: string
  timestamp: string
  seconds: number
}

export interface ParsedTranscript {
  turns: TranscriptTurn[]
  chapters: TranscriptChapter[]
}

export function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

export function parseTranscript(markdown: string): ParsedTranscript {
  const turns: TranscriptTurn[] = []
  const chapters: TranscriptChapter[] = []
  let currentChapter = '00:00:00'
  let current: TranscriptTurn | null = null

  const flush = () => {
    if (!current) return
    current.content = current.content.replace(/\s*\n\s*/g, '\n\n').trim()
    turns.push(current)
    current = null
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    const chapterMatch = line.match(/^##\s+(\d{2}:\d{2}:\d{2})$/)
    if (chapterMatch?.[1]) {
      flush()
      currentChapter = chapterMatch[1]
      chapters.push({
        id: `chapter-${currentChapter.replaceAll(':', '-')}`,
        timestamp: currentChapter,
        seconds: timestampToSeconds(currentChapter),
      })
      continue
    }

    const turnMatch = line.match(/^\*\*\[(\d{2}:\d{2}:\d{2})\]\s+([^：]+)：\*\*\s*(.*)$/)
    if (turnMatch?.[1] && turnMatch[2] != null) {
      flush()
      const timestamp = turnMatch[1]
      current = {
        id: `turn-${turns.length + 1}`,
        timestamp,
        seconds: timestampToSeconds(timestamp),
        speaker: cleanMarkdown(turnMatch[2]),
        content: cleanMarkdown(turnMatch[3] ?? ''),
        chapter: currentChapter,
      }
      continue
    }

    if (current && line && !line.startsWith('#') && !/^---+$/.test(line) && !/^\*\*【.+】\*\*$/.test(line)) {
      current.content += `${current.content ? '\n' : ''}${cleanMarkdown(line)}`
    }
  }
  flush()
  return { turns, chapters }
}

export function filterTranscript(turns: TranscriptTurn[], query: string): TranscriptTurn[] {
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  if (!needle) return turns
  return turns.filter((turn) => `${turn.speaker} ${turn.timestamp} ${turn.content}`.toLocaleLowerCase('zh-CN').includes(needle))
}
